import { createHash } from "node:crypto";
import { rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { FastifyBaseLogger } from "fastify";
import type {
  EventCluster,
  MailKnowledgeRecord,
  MailPersonalizationArtifact,
  MailPersonalizationEntityState,
  MailPersonalizationFeedbackContext,
  MailPersonalizationFeedbackEvent,
  MailPersonalizationFeedbackEventType,
  MailPersonalizationFeedbackInput,
  MailPersonalizationLearnedSignal,
  MailPersonalizationLearningResult,
  MailPersonalizationOverride,
  MailPersonalizationStructuredProfile,
  MailPersonalizationTargetType,
  MailQuadrant,
  PersonProfile,
  TriageMailItem,
} from "@mail-agent/shared-types";
import { getPrismaClient } from "./persistence.js";
import { ensureParentDirectory, readJsonFile, writeJsonFile } from "./runtime/json-file-store.js";
import { runtimePaths } from "./runtime/paths.js";
import { getMailPersonalizationProfile } from "./personalization-profile-store.js";

type PersonalizationFeedbackRow = {
  id: string;
  userId: string;
  sourceId: string;
  targetType: MailPersonalizationTargetType;
  targetId: string;
  eventType: MailPersonalizationFeedbackEventType;
  quadrant: MailQuadrant | null;
  dwellMs: number | null;
  contextJson: string | null;
  createdAt: Date;
};

type PersonalizationOverrideRow = {
  id: string;
  userId: string;
  sourceId: string;
  targetType: MailPersonalizationTargetType;
  targetId: string;
  quadrant: MailQuadrant;
  contextJson: string | null;
  updatedAt: Date;
};

type PersonalizationLearnedSignalRow = {
  kind: string;
  value: string;
  label: string;
  weight: number;
  sampleCount: number;
  evidenceJson: string | null;
  updatedAt: Date;
};

type ScoreScale = "ratio" | "ten";

type PersonalizationResolvedProfileArtifact = {
  updatedAt: string;
  effectiveProfile: MailPersonalizationStructuredProfile;
  summaryLines: string[];
};

const personalizationDir = join(runtimePaths.dataDir, "personalization-profiles");
const maxFeedbackEvents = 120;
const maxEvidenceLines = 4;

type CachedLearningState = MailPersonalizationLearningResult & {
  version: 1;
  sourceId: string;
};

function personalizationScopeHash(userId: string, sourceId: string): string {
  return createHash("sha256").update(`mail-personalization:${userId}:${sourceId}`).digest("hex").slice(0, 24);
}

function learningJsonPath(userId: string, sourceId: string): string {
  return join(personalizationDir, `${personalizationScopeHash(userId, sourceId)}.learning.json`);
}

function learningMarkdownPath(userId: string, sourceId: string): string {
  return join(personalizationDir, `${personalizationScopeHash(userId, sourceId)}.learning.md`);
}

function overridesJsonPath(userId: string, sourceId: string): string {
  return join(personalizationDir, `${personalizationScopeHash(userId, sourceId)}.overrides.json`);
}

function overridesMarkdownPath(userId: string, sourceId: string): string {
  return join(personalizationDir, `${personalizationScopeHash(userId, sourceId)}.overrides.md`);
}

function resolvedJsonPath(userId: string, sourceId: string): string {
  return join(personalizationDir, `${personalizationScopeHash(userId, sourceId)}.resolved.json`);
}

function resolvedMarkdownPath(userId: string, sourceId: string): string {
  return join(personalizationDir, `${personalizationScopeHash(userId, sourceId)}.resolved.md`);
}

function defaultArtifacts(userId: string, sourceId: string): MailPersonalizationArtifact[] {
  return [
    { key: "guide", label: "个性化判据文档", path: join(personalizationDir, `${personalizationScopeHash(userId, sourceId)}.md`) },
    { key: "json", label: "个性化判据 JSON", path: join(personalizationDir, `${personalizationScopeHash(userId, sourceId)}.json`) },
    { key: "learning", label: "行为学习文档", path: learningMarkdownPath(userId, sourceId) },
    { key: "learning_json", label: "行为学习 JSON", path: learningJsonPath(userId, sourceId) },
    { key: "overrides", label: "手动覆盖文档", path: overridesMarkdownPath(userId, sourceId) },
    { key: "overrides_json", label: "手动覆盖 JSON", path: overridesJsonPath(userId, sourceId) },
    { key: "resolved", label: "生效判据文档", path: resolvedMarkdownPath(userId, sourceId) },
    { key: "resolved_json", label: "生效判据 JSON", path: resolvedJsonPath(userId, sourceId) },
  ];
}

function trimText(value: string | undefined | null): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function dedupeStrings(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const raw of values) {
    const value = trimText(raw);
    if (!value) {
      continue;
    }
    const signature = value.toLowerCase();
    if (seen.has(signature)) {
      continue;
    }
    seen.add(signature);
    output.push(value);
  }
  return output;
}

function normalizeFeedbackContext(
  context: MailPersonalizationFeedbackContext | undefined
): MailPersonalizationFeedbackContext | undefined {
  if (!context) {
    return undefined;
  }

  const normalized: MailPersonalizationFeedbackContext = {};
  const tags = Array.isArray(context.tags)
    ? dedupeStrings(context.tags.map((value) => trimText(value).slice(0, 80))).slice(0, 8)
    : [];

  for (const [key, value] of Object.entries(context)) {
    if (key === "tags") {
      continue;
    }
    if (key === "currentQuadrant") {
      if (isMailQuadrant(value)) {
        normalized.currentQuadrant = value;
      }
      continue;
    }
    if (typeof value === "string") {
      const cleaned = trimText(value).slice(0, 300);
      if (cleaned) {
        (normalized as Record<string, string>)[key] = cleaned;
      }
    }
  }

  if (tags.length > 0) {
    normalized.tags = tags;
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function isMailQuadrant(value: unknown): value is MailQuadrant {
  return (
    value === "unprocessed" ||
    value === "urgent_important" ||
    value === "not_urgent_important" ||
    value === "urgent_not_important" ||
    value === "not_urgent_not_important"
  );
}

function normalizeFeedbackInput(input: MailPersonalizationFeedbackInput): MailPersonalizationFeedbackInput {
  return {
    targetType: input.targetType,
    targetId: trimText(input.targetId).slice(0, 4096),
    eventType: input.eventType,
    ...(typeof input.dwellMs === "number" && Number.isFinite(input.dwellMs)
      ? { dwellMs: Math.max(0, Math.min(Math.round(input.dwellMs), 24 * 60 * 60 * 1000)) }
      : {}),
    ...(isMailQuadrant(input.quadrant) ? { quadrant: input.quadrant } : {}),
    ...(normalizeFeedbackContext(input.context) ? { context: normalizeFeedbackContext(input.context) } : {}),
  };
}

function feedbackRowToEvent(row: PersonalizationFeedbackRow): MailPersonalizationFeedbackEvent {
  return {
    id: row.id,
    targetType: row.targetType,
    targetId: row.targetId,
    eventType: row.eventType,
    ...(row.dwellMs !== null ? { dwellMs: row.dwellMs } : {}),
    ...(row.quadrant ? { quadrant: row.quadrant } : {}),
    ...(parseJsonObject<MailPersonalizationFeedbackContext>(row.contextJson) ? { context: parseJsonObject<MailPersonalizationFeedbackContext>(row.contextJson) ?? undefined } : {}),
    createdAt: row.createdAt.toISOString(),
  };
}

function overrideRowToView(row: PersonalizationOverrideRow): MailPersonalizationOverride {
  return {
    targetType: row.targetType,
    targetId: row.targetId,
    quadrant: row.quadrant,
    updatedAt: row.updatedAt.toISOString(),
    ...(parseJsonObject<MailPersonalizationFeedbackContext>(row.contextJson) ? { context: parseJsonObject<MailPersonalizationFeedbackContext>(row.contextJson) ?? undefined } : {}),
  };
}

function toLearnedSignal(
  row: PersonalizationLearnedSignalRow,
  kind: MailPersonalizationLearnedSignal["kind"]
): MailPersonalizationLearnedSignal {
  return {
    kind,
    value: row.value,
    label: row.label,
    weight: row.weight,
    sampleCount: row.sampleCount,
    lastLearnedAt: row.updatedAt.toISOString(),
    evidence: parseJsonArray(row.evidenceJson),
  };
}

function parseJsonObject<T>(value: string | null): T | null {
  if (!value) {
    return null;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function parseJsonArray(value: string | null): string[] {
  const parsed = parseJsonObject<unknown>(value);
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed
    .filter((item): item is string => typeof item === "string")
    .map((item) => trimText(item))
    .filter(Boolean);
}

function quadrantWeight(event: MailPersonalizationFeedbackEvent): number {
  if (event.eventType === "manual_override") {
    return 3;
  }
  if (event.eventType === "knowledge_card_saved" || event.eventType === "calendar_sync") {
    return 3;
  }
  if (event.eventType === "external_mail_open" || event.eventType === "related_mail_open") {
    return 2;
  }
  const dwellMs = event.dwellMs ?? 0;
  if (dwellMs < 5_000) {
    return 0;
  }
  if (dwellMs < 20_000) {
    return 1;
  }
  if (dwellMs < 60_000) {
    return 2;
  }
  return 3;
}

function scaleForScore(value: number, explicit?: ScoreScale): ScoreScale {
  if (explicit === "ratio" || explicit === "ten") {
    return explicit;
  }
  return value > 1 ? "ten" : "ratio";
}

function toRatio(value: number, scale: ScoreScale): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return scale === "ten" ? Math.max(0, Math.min(1, value / 10)) : Math.max(0, Math.min(1, value));
}

function fromRatio(value: number, scale: ScoreScale): number {
  return scale === "ten"
    ? Number(Math.max(0, Math.min(10, value * 10)).toFixed(2))
    : Number(Math.max(0, Math.min(1, value)).toFixed(3));
}

function quadrantFromRatio(importance: number, urgency: number): MailQuadrant {
  if (importance <= 0 && urgency <= 0) {
    return "unprocessed";
  }
  const important = importance >= 0.7;
  const urgent = urgency >= 0.7;
  if (important && urgent) {
    return "urgent_important";
  }
  if (important) {
    return "not_urgent_important";
  }
  if (urgent) {
    return "urgent_not_important";
  }
  return "not_urgent_not_important";
}

function forcedRatioScoresByQuadrant(quadrant: MailQuadrant): { importance: number; urgency: number } {
  switch (quadrant) {
    case "urgent_important":
      return { importance: 0.95, urgency: 0.95 };
    case "not_urgent_important":
      return { importance: 0.9, urgency: 0.42 };
    case "urgent_not_important":
      return { importance: 0.42, urgency: 0.88 };
    case "not_urgent_not_important":
      return { importance: 0.2, urgency: 0.2 };
    default:
      return { importance: 0.1, urgency: 0.1 };
  }
}

function firstMatchedProfileItem(items: string[], haystacks: string[]): string | null {
  const lowerHaystacks = haystacks.map((value) => value.toLowerCase());
  for (const item of items) {
    const normalized = item.toLowerCase();
    if (lowerHaystacks.some((haystack) => haystack.includes(normalized))) {
      return item;
    }
  }
  return null;
}

function normalizeEmailCandidate(value: string | undefined): string | null {
  const trimmed = trimText(value).toLowerCase();
  if (!trimmed || !trimmed.includes("@")) {
    return null;
  }
  return trimmed.slice(0, 160);
}

function normalizePhraseCandidate(value: string | undefined): string | null {
  const trimmed = trimText(value)
    .replace(/[\r\n]+/g, " ")
    .replace(/[<>{}[\]"]/g, "")
    .slice(0, 80);
  if (!trimmed || trimmed.length < 2) {
    return null;
  }
  return trimmed;
}

function signalCandidates(context: MailPersonalizationFeedbackContext | undefined) {
  return {
    senders: dedupeStrings([
      normalizeEmailCandidate(context?.personEmail),
      normalizeEmailCandidate(context?.fromAddress),
      normalizePhraseCandidate(context?.personName),
      normalizePhraseCandidate(context?.fromName),
    ]),
    topics: dedupeStrings([
      normalizePhraseCandidate(context?.eventName),
      normalizePhraseCandidate(context?.subject),
      ...(context?.tags ?? []).map((tag) => normalizePhraseCandidate(tag)),
    ]),
  };
}

type MutableSignal = {
  weight: number;
  samples: number;
  evidence: Set<string>;
  label: string;
};

function bumpSignal(
  map: Map<string, MutableSignal>,
  value: string,
  weight: number,
  evidence: string,
  label = value
) {
  if (!value || weight <= 0) {
    return;
  }
  const existing = map.get(value) ?? {
    weight: 0,
    samples: 0,
    evidence: new Set<string>(),
    label,
  };
  existing.weight += weight;
  existing.samples += 1;
  if (existing.evidence.size < maxEvidenceLines) {
    existing.evidence.add(trimText(evidence).slice(0, 160));
  }
  map.set(value, existing);
}

function quadrantFromEvent(event: MailPersonalizationFeedbackEvent): MailQuadrant | null {
  if (isMailQuadrant(event.quadrant)) {
    return event.quadrant;
  }
  if (isMailQuadrant(event.context?.currentQuadrant)) {
    return event.context.currentQuadrant;
  }
  return null;
}

function eventEvidenceLine(event: MailPersonalizationFeedbackEvent): string {
  const parts = [
    event.eventType,
    trimText(event.context?.subject),
    trimText(event.context?.eventName),
    trimText(event.context?.personName),
  ].filter(Boolean);
  return parts.join(" · ") || event.targetId;
}

function learnedSignalsFromEvents(
  events: MailPersonalizationFeedbackEvent[],
  overrides: MailPersonalizationOverride[]
): MailPersonalizationLearningResult["learnedSignals"] {
  const vipSenders = new Map<string, MutableSignal>();
  const urgentSignals = new Map<string, MutableSignal>();
  const importantTopics = new Map<string, MutableSignal>();
  const noiseSources = new Map<string, MutableSignal>();

  const combinedEvents = [
    ...events,
    ...overrides.map<MailPersonalizationFeedbackEvent>((override, index) => ({
      id: `override:${override.targetType}:${override.targetId}:${index}`,
      targetType: override.targetType,
      targetId: override.targetId,
      eventType: "manual_override",
      quadrant: override.quadrant,
      context: override.context,
      createdAt: override.updatedAt,
    })),
  ];

  for (const event of combinedEvents) {
    const weight = quadrantWeight(event);
    const quadrant = quadrantFromEvent(event);
    const evidence = eventEvidenceLine(event);
    const candidates = signalCandidates(event.context);

    if (event.eventType === "knowledge_card_saved") {
      for (const sender of candidates.senders) {
        bumpSignal(vipSenders, sender, 2, evidence);
      }
      for (const topic of candidates.topics) {
        bumpSignal(importantTopics, topic, 2, evidence);
      }
      continue;
    }

    if (event.eventType === "calendar_sync") {
      for (const topic of candidates.topics) {
        bumpSignal(importantTopics, topic, 1.5, evidence);
        bumpSignal(urgentSignals, topic, 1.5, evidence);
      }
      continue;
    }

    if (!quadrant) {
      if (event.targetType === "person" && weight > 0) {
        for (const sender of candidates.senders) {
          bumpSignal(vipSenders, sender, weight, evidence);
        }
      }
      if (event.targetType === "event" && weight > 0) {
        for (const topic of candidates.topics) {
          bumpSignal(importantTopics, topic, weight, evidence);
        }
      }
      continue;
    }

    if (quadrant === "urgent_important") {
      for (const sender of candidates.senders) {
        bumpSignal(vipSenders, sender, weight, evidence);
      }
      for (const topic of candidates.topics) {
        bumpSignal(importantTopics, topic, weight, evidence);
        bumpSignal(urgentSignals, topic, weight, evidence);
      }
      continue;
    }

    if (quadrant === "not_urgent_important") {
      for (const sender of candidates.senders) {
        bumpSignal(vipSenders, sender, weight, evidence);
      }
      for (const topic of candidates.topics) {
        bumpSignal(importantTopics, topic, weight, evidence);
      }
      continue;
    }

    if (quadrant === "urgent_not_important") {
      for (const topic of candidates.topics) {
        bumpSignal(urgentSignals, topic, weight, evidence);
      }
      continue;
    }

    if (quadrant === "not_urgent_not_important") {
      for (const sender of candidates.senders) {
        bumpSignal(noiseSources, sender, weight, evidence);
      }
      for (const topic of candidates.topics) {
        bumpSignal(noiseSources, topic, weight, evidence);
      }
    }
  }

  const materialize = (
    map: Map<string, MutableSignal>,
    kind: MailPersonalizationLearnedSignal["kind"],
    minWeight: number
  ): MailPersonalizationLearnedSignal[] =>
    [...map.entries()]
      .filter(([, signal]) => signal.weight >= minWeight)
      .sort((left, right) => right[1].weight - left[1].weight || right[1].samples - left[1].samples)
      .slice(0, 12)
      .map(([value, signal]) => ({
        kind,
        value,
        label: signal.label,
        weight: Number(signal.weight.toFixed(2)),
        sampleCount: signal.samples,
        lastLearnedAt: new Date().toISOString(),
        evidence: [...signal.evidence].slice(0, maxEvidenceLines),
      }));

  const positiveSenderKeys = new Set(materialize(vipSenders, "vip_sender", 4).map((item) => item.value.toLowerCase()));
  const positiveTopicKeys = new Set(
    materialize(importantTopics, "important_topic", 4)
      .map((item) => item.value.toLowerCase())
      .concat(materialize(urgentSignals, "urgent_signal", 4).map((item) => item.value.toLowerCase()))
  );

  return {
    vipSenders: materialize(vipSenders, "vip_sender", 4),
    urgentSignals: materialize(urgentSignals, "urgent_signal", 4),
    hiddenImportantTopics: materialize(importantTopics, "important_topic", 4),
    noiseSources: materialize(noiseSources, "noise_source", 4).filter(
      (item) => !positiveSenderKeys.has(item.value.toLowerCase()) && !positiveTopicKeys.has(item.value.toLowerCase())
    ),
  };
}

function mergeStructuredProfile(
  baseProfile: MailPersonalizationStructuredProfile,
  learnedSignals: MailPersonalizationLearningResult["learnedSignals"]
): MailPersonalizationStructuredProfile {
  return {
    urgentSignals: dedupeStrings([
      ...baseProfile.urgentSignals,
      ...learnedSignals.urgentSignals.map((item) => item.value),
    ]),
    hiddenImportantTopics: dedupeStrings([
      ...baseProfile.hiddenImportantTopics,
      ...learnedSignals.hiddenImportantTopics.map((item) => item.value),
    ]),
    deadlineAlertWindowHours: baseProfile.deadlineAlertWindowHours,
    vipSenders: dedupeStrings([
      ...baseProfile.vipSenders,
      ...learnedSignals.vipSenders.map((item) => item.value),
    ]),
    softRejectMode: baseProfile.softRejectMode,
    softRejectNotes: baseProfile.softRejectNotes,
    noiseSources: dedupeStrings([
      ...baseProfile.noiseSources,
      ...learnedSignals.noiseSources.map((item) => item.value),
    ]),
    notes: baseProfile.notes,
  };
}

function buildResolvedSummaryLines(
  effectiveProfile: MailPersonalizationStructuredProfile,
  learnedSignals: MailPersonalizationLearningResult["learnedSignals"]
): string[] {
  const lines: string[] = [];
  if (effectiveProfile.vipSenders.length > 0) {
    lines.push(`优先联系人：${effectiveProfile.vipSenders.join(" / ")}`);
  }
  if (effectiveProfile.urgentSignals.length > 0) {
    lines.push(`紧急信号：${effectiveProfile.urgentSignals.join(" / ")}`);
  }
  if (effectiveProfile.hiddenImportantTopics.length > 0) {
    lines.push(`高价值主题：${effectiveProfile.hiddenImportantTopics.join(" / ")}`);
  }
  if (effectiveProfile.noiseSources.length > 0) {
    lines.push(`降噪来源：${effectiveProfile.noiseSources.join(" / ")}`);
  }
  const learnedCount =
    learnedSignals.vipSenders.length +
    learnedSignals.urgentSignals.length +
    learnedSignals.hiddenImportantTopics.length +
    learnedSignals.noiseSources.length;
  lines.push(`自动学习到 ${learnedCount} 条行为信号，后续分类会持续参考。`);
  return lines;
}

function buildLearningMarkdown(state: CachedLearningState): string {
  const lines = [
    "# 行为学习文档",
    "",
    `- Updated At: ${state.updatedAt}`,
    `- Recent Feedback: ${state.recentFeedback.length}`,
    `- Manual Overrides: ${state.overrides.length}`,
    "",
    "## 学到的优先联系人",
    "",
    ...(state.learnedSignals.vipSenders.length > 0
      ? state.learnedSignals.vipSenders.map((item) => `- ${item.value} (weight=${item.weight}, samples=${item.sampleCount})`)
      : ["- 暂无"]),
    "",
    "## 学到的紧急信号",
    "",
    ...(state.learnedSignals.urgentSignals.length > 0
      ? state.learnedSignals.urgentSignals.map((item) => `- ${item.value} (weight=${item.weight}, samples=${item.sampleCount})`)
      : ["- 暂无"]),
    "",
    "## 学到的重要主题",
    "",
    ...(state.learnedSignals.hiddenImportantTopics.length > 0
      ? state.learnedSignals.hiddenImportantTopics.map((item) => `- ${item.value} (weight=${item.weight}, samples=${item.sampleCount})`)
      : ["- 暂无"]),
    "",
    "## 学到的噪音来源",
    "",
    ...(state.learnedSignals.noiseSources.length > 0
      ? state.learnedSignals.noiseSources.map((item) => `- ${item.value} (weight=${item.weight}, samples=${item.sampleCount})`)
      : ["- 暂无"]),
    "",
    "## 最近行为反馈",
    "",
    ...(state.recentFeedback.length > 0
      ? state.recentFeedback.map(
          (event) =>
            `- ${event.createdAt} | ${event.targetType}:${event.targetId} | ${event.eventType}${event.dwellMs !== undefined ? ` | dwell=${event.dwellMs}ms` : ""}${event.quadrant ? ` | quadrant=${event.quadrant}` : ""}`
        )
      : ["- 暂无"]),
    "",
  ];

  return `${lines.join("\n")}\n`;
}

function buildOverridesMarkdown(state: CachedLearningState): string {
  const lines = [
    "# 手动覆盖文档",
    "",
    `- Updated At: ${state.updatedAt}`,
    `- Override Count: ${state.overrides.length}`,
    "",
    ...(state.overrides.length > 0
      ? state.overrides.flatMap((override) => [
          `## ${override.targetType}:${override.targetId}`,
          `- Quadrant: ${override.quadrant}`,
          `- Updated At: ${override.updatedAt}`,
          `- Subject/Event/Person: ${trimText(override.context?.subject) || trimText(override.context?.eventName) || trimText(override.context?.personName) || "未命名"}`,
          "",
        ])
      : ["暂无手动覆盖。\n"]),
  ];

  return `${lines.join("\n")}\n`;
}

function buildResolvedMarkdown(
  effectiveProfile: MailPersonalizationStructuredProfile,
  summaryLines: string[]
): string {
  const lines = [
    "# 生效判据文档",
    "",
    "## 摘要",
    "",
    ...summaryLines.map((line) => `- ${line}`),
    "",
    "## 当前生效判据",
    "",
    "```json",
    JSON.stringify(effectiveProfile, null, 2),
    "```",
    "",
  ];

  return `${lines.join("\n")}\n`;
}

async function writeTextArtifact(path: string, content: string): Promise<void> {
  await ensureParentDirectory(path);
  const tempPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, content, "utf8");
  await rename(tempPath, path);
}

function emptyStructuredProfile(): MailPersonalizationStructuredProfile {
  return {
    urgentSignals: [],
    hiddenImportantTopics: [],
    deadlineAlertWindowHours: 48,
    vipSenders: [],
    softRejectMode: "downgrade_only",
    softRejectNotes: "",
    noiseSources: [],
    notes: [],
  };
}

function defaultLearningState(userId: string, sourceId: string): CachedLearningState {
  return {
    version: 1,
    sourceId,
    updatedAt: new Date().toISOString(),
    recentFeedback: [],
    overrides: [],
    learnedSignals: {
      vipSenders: [],
      urgentSignals: [],
      hiddenImportantTopics: [],
      noiseSources: [],
    },
    effectiveProfile: emptyStructuredProfile(),
    artifacts: defaultArtifacts(userId, sourceId),
  };
}

export async function getCachedMailPersonalizationLearningState(
  userId: string,
  sourceId: string
): Promise<MailPersonalizationLearningResult> {
  const state = await readJsonFile<CachedLearningState | null>(learningJsonPath(userId, sourceId), null);
  if (!state) {
    const profile = await getMailPersonalizationProfile(userId, sourceId);
    return {
      ...defaultLearningState(userId, sourceId),
      effectiveProfile: profile.profile,
    };
  }

  return {
    ...state,
    artifacts: defaultArtifacts(userId, sourceId),
  };
}

export async function getResolvedMailPersonalizationRuntimeProfile(
  userId: string | undefined,
  sourceId: string | undefined
): Promise<{
  urgentSignals: string[];
  hiddenImportantTopics: string[];
  deadlineAlertWindowHours: number;
  vipSenders: string[];
  softRejectMode: MailPersonalizationStructuredProfile["softRejectMode"];
  softRejectNotes: string;
  noiseSources: string[];
  notes: string[];
  profileId: string;
  completed: boolean;
  summaryLines: string[];
  updatedAt: string;
} | null> {
  if (!userId || !sourceId) {
    return null;
  }

  const profile = await getMailPersonalizationProfile(userId, sourceId);
  const cached = await getCachedMailPersonalizationLearningState(userId, sourceId);
  const effectiveProfile = mergeStructuredProfile(profile.profile, cached.learnedSignals);
  const summaryLines = buildResolvedSummaryLines(effectiveProfile, cached.learnedSignals);
  const hasSignals =
    effectiveProfile.urgentSignals.length > 0 ||
    effectiveProfile.hiddenImportantTopics.length > 0 ||
    effectiveProfile.deadlineAlertWindowHours !== 48 ||
    effectiveProfile.vipSenders.length > 0 ||
    effectiveProfile.noiseSources.length > 0 ||
    effectiveProfile.notes.length > 0 ||
    Boolean(effectiveProfile.softRejectNotes);

  if (!profile.completed && !hasSignals) {
    return null;
  }

  return {
    ...effectiveProfile,
    profileId: profile.profileId,
    completed: profile.completed,
    summaryLines,
    updatedAt: cached.updatedAt,
  };
}

export async function rebuildMailPersonalizationLearningState(
  userId: string,
  sourceId: string,
  logger: FastifyBaseLogger
): Promise<MailPersonalizationLearningResult> {
  const prisma = (await getPrismaClient(logger)) as any;
  if (!prisma?.personalizationFeedbackEvent?.findMany) {
    return getCachedMailPersonalizationLearningState(userId, sourceId);
  }

  const [feedbackRows, overrideRows] = await Promise.all([
    prisma.personalizationFeedbackEvent.findMany({
      where: { userId, sourceId },
      orderBy: { createdAt: "desc" },
      take: maxFeedbackEvents,
    }),
    prisma.personalizationOverride.findMany({
      where: { userId, sourceId },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  const recentFeedback = (feedbackRows as PersonalizationFeedbackRow[]).map(feedbackRowToEvent);
  const overrides = (overrideRows as PersonalizationOverrideRow[]).map(overrideRowToView);
  const learnedSignals = learnedSignalsFromEvents(recentFeedback, overrides);
  const profile = await getMailPersonalizationProfile(userId, sourceId);
  const effectiveProfile = mergeStructuredProfile(profile.profile, learnedSignals);
  const summaryLines = buildResolvedSummaryLines(effectiveProfile, learnedSignals);

  const signalRows = [
    ...learnedSignals.vipSenders,
    ...learnedSignals.urgentSignals,
    ...learnedSignals.hiddenImportantTopics,
    ...learnedSignals.noiseSources,
  ];

  if (prisma.personalizationLearnedSignal?.deleteMany && prisma.personalizationLearnedSignal?.createMany) {
    await prisma.personalizationLearnedSignal.deleteMany({ where: { userId, sourceId } });
    if (signalRows.length > 0) {
      await prisma.personalizationLearnedSignal.createMany({
        data: signalRows.map((signal) => ({
          userId,
          sourceId,
          kind: signal.kind,
          value: signal.value,
          label: signal.label,
          weight: signal.weight,
          sampleCount: signal.sampleCount,
          evidenceJson: JSON.stringify(signal.evidence),
        })),
      });
    }
  }

  const state: CachedLearningState = {
    version: 1,
    sourceId,
    updatedAt: new Date().toISOString(),
    recentFeedback,
    overrides,
    learnedSignals,
    effectiveProfile,
    artifacts: defaultArtifacts(userId, sourceId),
  };

  await writeJsonFile(learningJsonPath(userId, sourceId), state);
  await writeJsonFile(overridesJsonPath(userId, sourceId), {
    updatedAt: state.updatedAt,
    sourceId,
    overrides,
    artifacts: defaultArtifacts(userId, sourceId),
  });
  const resolvedArtifact: PersonalizationResolvedProfileArtifact = {
    updatedAt: state.updatedAt,
    effectiveProfile,
    summaryLines,
  };
  await writeJsonFile(resolvedJsonPath(userId, sourceId), resolvedArtifact);
  await writeTextArtifact(learningMarkdownPath(userId, sourceId), buildLearningMarkdown(state));
  await writeTextArtifact(overridesMarkdownPath(userId, sourceId), buildOverridesMarkdown(state));
  await writeTextArtifact(resolvedMarkdownPath(userId, sourceId), buildResolvedMarkdown(effectiveProfile, summaryLines));

  return state;
}

export async function recordMailPersonalizationFeedback(
  userId: string,
  sourceId: string,
  events: MailPersonalizationFeedbackInput[],
  logger: FastifyBaseLogger
): Promise<MailPersonalizationLearningResult> {
  const prisma = (await getPrismaClient(logger)) as any;
  if (!prisma?.personalizationFeedbackEvent?.create) {
    return getCachedMailPersonalizationLearningState(userId, sourceId);
  }

  for (const rawEvent of events) {
    const event = normalizeFeedbackInput(rawEvent);
    if (!event.targetId) {
      continue;
    }
    await prisma.personalizationFeedbackEvent.create({
      data: {
        userId,
        sourceId,
        targetType: event.targetType,
        targetId: event.targetId,
        eventType: event.eventType,
        quadrant: event.quadrant ?? null,
        dwellMs: event.dwellMs ?? null,
        contextJson: event.context ? JSON.stringify(event.context) : null,
      },
    });
  }

  return rebuildMailPersonalizationLearningState(userId, sourceId, logger);
}

export async function saveMailPersonalizationOverride(
  userId: string,
  sourceId: string,
  input: {
    targetType: MailPersonalizationTargetType;
    targetId: string;
    quadrant: MailQuadrant | null;
    context?: MailPersonalizationFeedbackContext;
  },
  logger: FastifyBaseLogger
): Promise<MailPersonalizationLearningResult> {
  const prisma = (await getPrismaClient(logger)) as any;
  if (!prisma?.personalizationOverride?.upsert) {
    return getCachedMailPersonalizationLearningState(userId, sourceId);
  }

  const targetId = trimText(input.targetId).slice(0, 4096);
  const context = normalizeFeedbackContext(input.context);

  if (!targetId) {
    return getCachedMailPersonalizationLearningState(userId, sourceId);
  }

  if (input.quadrant) {
    await prisma.personalizationOverride.upsert({
      where: {
        userId_sourceId_targetType_targetId: {
          userId,
          sourceId,
          targetType: input.targetType,
          targetId,
        },
      },
      create: {
        userId,
        sourceId,
        targetType: input.targetType,
        targetId,
        quadrant: input.quadrant,
        contextJson: context ? JSON.stringify(context) : null,
      },
      update: {
        quadrant: input.quadrant,
        contextJson: context ? JSON.stringify(context) : null,
      },
    });
  } else {
    await prisma.personalizationOverride.deleteMany({
      where: {
        userId,
        sourceId,
        targetType: input.targetType,
        targetId,
      },
    });
  }

  if (input.quadrant) {
    await prisma.personalizationFeedbackEvent.create({
      data: {
        userId,
        sourceId,
        targetType: input.targetType,
        targetId,
        eventType: "manual_override",
        quadrant: input.quadrant,
        contextJson: context ? JSON.stringify({ ...context, currentQuadrant: input.quadrant }) : null,
      },
    });
  }

  return rebuildMailPersonalizationLearningState(userId, sourceId, logger);
}

function manualSourceForTarget(targetType: MailPersonalizationTargetType): MailPersonalizationEntityState["source"] {
  if (targetType === "mail") {
    return "manual_mail";
  }
  if (targetType === "event") {
    return "manual_event";
  }
  return "manual_person";
}

function findOverride(
  overrides: MailPersonalizationOverride[],
  targetType: MailPersonalizationTargetType,
  targetIds: string[]
): MailPersonalizationOverride | null {
  const normalizedIds = new Set(targetIds.map((value) => trimText(value)).filter(Boolean));
  for (const override of overrides) {
    if (override.targetType !== targetType) {
      continue;
    }
    if (normalizedIds.has(override.targetId)) {
      return override;
    }
    if (override.context?.rawMessageId && normalizedIds.has(override.context.rawMessageId)) {
      return override;
    }
    if (override.context?.mailId && normalizedIds.has(override.context.mailId)) {
      return override;
    }
  }
  return null;
}

function applyProfileToRatioScores(
  baseImportance: number,
  baseUrgency: number,
  profile: MailPersonalizationStructuredProfile,
  senderText: string,
  contentText: string
): { importance: number; urgency: number; explanation: string | null } {
  let importance = baseImportance;
  let urgency = baseUrgency;
  const reasons: string[] = [];

  const vipMatch = firstMatchedProfileItem(profile.vipSenders, [senderText]);
  if (vipMatch) {
    importance = Math.max(importance, 0.85);
    urgency = Math.max(urgency, 0.75);
    reasons.push(`命中学习后的优先联系人: ${vipMatch}`);
  }

  const urgentMatch = firstMatchedProfileItem(profile.urgentSignals, [contentText]);
  if (urgentMatch) {
    urgency = Math.min(1, urgency + 0.2);
    reasons.push(`命中学习后的紧急信号: ${urgentMatch}`);
  }

  const importantMatch = firstMatchedProfileItem(profile.hiddenImportantTopics, [contentText]);
  if (importantMatch) {
    importance = Math.min(1, importance + 0.2);
    reasons.push(`命中学习后的高价值主题: ${importantMatch}`);
  }

  const noiseMatch = firstMatchedProfileItem(profile.noiseSources, [senderText, contentText]);
  if (noiseMatch && !vipMatch) {
    importance = Math.min(importance, 0.25);
    urgency = Math.min(urgency, 0.25);
    reasons.push(`命中学习后的噪音来源: ${noiseMatch}`);
  }

  return {
    importance,
    urgency,
    explanation: reasons.length > 0 ? reasons.join("；") : null,
  };
}

export async function applyPersonalizationToTriageItems(
  userId: string | undefined,
  sourceId: string | undefined,
  items: TriageMailItem[]
): Promise<TriageMailItem[]> {
  if (!userId || !sourceId || items.length === 0) {
    return items;
  }

  const learningState = await getCachedMailPersonalizationLearningState(userId, sourceId);
  const profile = await getResolvedMailPersonalizationRuntimeProfile(userId, sourceId);
  if (!profile && learningState.overrides.length === 0) {
    return items.map((item) => ({
      ...item,
      personalization: {
        effectiveQuadrant: item.quadrant,
        source: "auto",
        lastFeedbackAt: null,
      },
    }));
  }

  return items.map((item) => {
    const exactOverride = findOverride(learningState.overrides, "mail", [item.id]);
    if (exactOverride) {
      return {
        ...item,
        quadrant: exactOverride.quadrant,
        score: {
          urgency: forcedRatioScoresByQuadrant(exactOverride.quadrant).urgency * 10,
          importance: forcedRatioScoresByQuadrant(exactOverride.quadrant).importance * 10,
        },
        personalization: {
          effectiveQuadrant: exactOverride.quadrant,
          source: manualSourceForTarget("mail"),
          manualQuadrant: exactOverride.quadrant,
          lastFeedbackAt: exactOverride.updatedAt,
          explanation: "用户在邮件详情中手动覆盖",
        },
      };
    }

    if (!profile) {
      return {
        ...item,
        personalization: {
          effectiveQuadrant: item.quadrant,
          source: "auto",
          lastFeedbackAt: null,
        },
      };
    }

    const senderText = `${item.fromName}\n${item.fromAddress}`.toLowerCase();
    const contentText = `${item.subject}\n${item.bodyPreview}`.toLowerCase();
    const scale = "ten";
    const adjusted = applyProfileToRatioScores(
      toRatio(item.score?.importance ?? 5, scale),
      toRatio(item.score?.urgency ?? 5, scale),
      profile,
      senderText,
      contentText
    );
    const effectiveQuadrant = quadrantFromRatio(adjusted.importance, adjusted.urgency);
    return {
      ...item,
      quadrant: effectiveQuadrant,
      score: {
        importance: fromRatio(adjusted.importance, scale),
        urgency: fromRatio(adjusted.urgency, scale),
      },
      personalization: {
        effectiveQuadrant,
        source: effectiveQuadrant === item.quadrant ? "auto" : "learned",
        lastFeedbackAt: learningState.updatedAt,
        ...(adjusted.explanation ? { explanation: adjusted.explanation } : {}),
      },
    };
  });
}

function deriveDominantQuadrant(items: MailQuadrant[]): MailQuadrant {
  if (items.length === 0) {
    return "unprocessed";
  }
  const counts = new Map<MailQuadrant, number>();
  for (const item of items) {
    counts.set(item, (counts.get(item) ?? 0) + 1);
  }
  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? "unprocessed";
}

export async function applyPersonalizationToKnowledgeBaseSnapshot(
  userId: string | undefined,
  sourceId: string | undefined,
  mails: MailKnowledgeRecord[],
  events: EventCluster[],
  persons: PersonProfile[]
): Promise<{
  mails: MailKnowledgeRecord[];
  events: EventCluster[];
  persons: PersonProfile[];
}> {
  if (!userId || !sourceId) {
    return { mails, events, persons };
  }

  const learningState = await getCachedMailPersonalizationLearningState(userId, sourceId);
  const profile = await getResolvedMailPersonalizationRuntimeProfile(userId, sourceId);
  const personById = new Map(persons.map((person) => [person.personId, person]));
  const eventById = new Map(events.map((event) => [event.eventId, event]));

  const personalizedMails = mails.map((mail) => {
    const exactOverride = findOverride(learningState.overrides, "mail", [mail.rawId, mail.mailId]);
    const eventOverride = mail.eventId ? findOverride(learningState.overrides, "event", [mail.eventId]) : null;
    const personOverride = mail.personId ? findOverride(learningState.overrides, "person", [mail.personId]) : null;
    const scale = scaleForScore(mail.importanceScore, mail.scoreScale);

    if (exactOverride || eventOverride || personOverride) {
      const override = exactOverride ?? eventOverride ?? personOverride;
      if (!override) {
        return mail;
      }
      const forced = forcedRatioScoresByQuadrant(override.quadrant);
      return {
        ...mail,
        quadrant: override.quadrant,
        importanceScore: fromRatio(forced.importance, scale),
        urgencyScore: fromRatio(forced.urgency, scale),
        personalization: {
          effectiveQuadrant: override.quadrant,
          source: manualSourceForTarget(override.targetType),
          manualQuadrant: override.quadrant,
          lastFeedbackAt: override.updatedAt,
          explanation:
            override.targetType === "mail"
              ? "邮件级手动覆盖"
              : override.targetType === "event"
                ? "事件级手动覆盖"
                : "人物级手动覆盖",
        },
      };
    }

    if (!profile) {
      const source: MailPersonalizationEntityState["source"] = "auto";
      return {
        ...mail,
        personalization: {
          effectiveQuadrant: mail.quadrant,
          source,
          lastFeedbackAt: null,
        },
      };
    }

    const person = personById.get(mail.personId);
    const event = mail.eventId ? eventById.get(mail.eventId) : null;
    const senderText = `${person?.name ?? ""}\n${person?.email ?? ""}`.toLowerCase();
    const contentText = `${mail.subject}\n${mail.summary}\n${event?.name ?? ""}\n${event?.summary ?? ""}\n${event?.keyInfo.join("\n") ?? ""}`.toLowerCase();
    const adjusted = applyProfileToRatioScores(
      toRatio(mail.importanceScore, scale),
      toRatio(mail.urgencyScore, scale),
      profile,
      senderText,
      contentText
    );
    const effectiveQuadrant = quadrantFromRatio(adjusted.importance, adjusted.urgency);
    const source: MailPersonalizationEntityState["source"] =
      effectiveQuadrant === mail.quadrant ? "auto" : "learned";
    return {
      ...mail,
      quadrant: effectiveQuadrant,
      importanceScore: fromRatio(adjusted.importance, scale),
      urgencyScore: fromRatio(adjusted.urgency, scale),
      personalization: {
        effectiveQuadrant,
        source,
        lastFeedbackAt: learningState.updatedAt,
        ...(adjusted.explanation ? { explanation: adjusted.explanation } : {}),
      },
    };
  });

  const personalizedEvents = events.map((event) => {
    const override = findOverride(learningState.overrides, "event", [event.eventId]);
    if (override) {
      return {
        ...event,
        personalization: {
          effectiveQuadrant: override.quadrant,
          source: manualSourceForTarget("event"),
          manualQuadrant: override.quadrant,
          lastFeedbackAt: override.updatedAt,
          explanation: "事件级手动覆盖",
        },
      };
    }
    const relatedQuadrants = personalizedMails
      .filter((mail) => mail.eventId === event.eventId)
      .map((mail) => mail.quadrant);
    const effectiveQuadrant = deriveDominantQuadrant(relatedQuadrants);
    const source: MailPersonalizationEntityState["source"] =
      effectiveQuadrant === "unprocessed" ? "auto" : "learned";
    return {
      ...event,
      personalization: {
        effectiveQuadrant,
        source,
        lastFeedbackAt: learningState.updatedAt,
        explanation: relatedQuadrants.length > 0 ? "基于关联邮件的当前象限分布" : null,
      },
    };
  });

  const personalizedPersons = persons.map((person) => {
    const override = findOverride(learningState.overrides, "person", [person.personId]);
    if (override) {
      return {
        ...person,
        personalization: {
          effectiveQuadrant: override.quadrant,
          source: manualSourceForTarget("person"),
          manualQuadrant: override.quadrant,
          lastFeedbackAt: override.updatedAt,
          explanation: "人物级手动覆盖",
        },
      };
    }
    const relatedQuadrants = personalizedMails
      .filter((mail) => mail.personId === person.personId)
      .map((mail) => mail.quadrant);
    const fallbackQuadrant = person.importance >= 0.7 || person.importance >= 7 ? "not_urgent_important" : "not_urgent_not_important";
    const effectiveQuadrant = relatedQuadrants.length > 0 ? deriveDominantQuadrant(relatedQuadrants) : fallbackQuadrant;
    const source: MailPersonalizationEntityState["source"] =
      effectiveQuadrant === fallbackQuadrant ? "auto" : "learned";
    return {
      ...person,
      personalization: {
        effectiveQuadrant,
        source,
        lastFeedbackAt: learningState.updatedAt,
        explanation: relatedQuadrants.length > 0 ? "基于往来邮件的当前象限分布" : "基于人物重要度的默认判断",
      },
    };
  });

  return {
    mails: personalizedMails,
    events: personalizedEvents,
    persons: personalizedPersons,
  };
}
