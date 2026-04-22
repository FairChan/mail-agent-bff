import { createHash } from "node:crypto";
import { rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  MailPersonalizationAnswers,
  MailPersonalizationArtifact,
  MailPersonalizationProfile,
  MailPersonalizationRejectMode,
  MailPersonalizationStructuredProfile,
} from "@mail-agent/shared-types";
import { ensureParentDirectory, readJsonFile, writeJsonFile } from "./runtime/json-file-store.js";
import { runtimePaths } from "./runtime/paths.js";

type PersistedMailPersonalizationProfile = MailPersonalizationProfile & {
  version: 1;
  userScope: string;
};

export type MailPersonalizationRuntimeProfile = MailPersonalizationStructuredProfile & {
  completed: boolean;
  profileId: string;
  summaryLines: string[];
};

type MailPersonalizationSaveInput = Partial<MailPersonalizationAnswers> & {
  completed?: boolean;
};

const personalizationDir = join(runtimePaths.dataDir, "personalization-profiles");
const defaultDeadlineAlertWindowHours = 48;

function personalizationScopeHash(userId: string, sourceId: string): string {
  return createHash("sha256").update(`mail-personalization:${userId}:${sourceId}`).digest("hex").slice(0, 24);
}

function personalizationUserScope(userId: string): string {
  return createHash("sha256").update(`mail-personalization-user:${userId}`).digest("hex").slice(0, 16);
}

function profileJsonPath(userId: string, sourceId: string): string {
  return join(personalizationDir, `${personalizationScopeHash(userId, sourceId)}.json`);
}

function profileMarkdownPath(userId: string, sourceId: string): string {
  return join(personalizationDir, `${personalizationScopeHash(userId, sourceId)}.md`);
}

function defaultAnswers(): MailPersonalizationAnswers {
  return {
    urgentSignals: "",
    hiddenImportantTopics: "",
    deadlineAlertWindowHours: defaultDeadlineAlertWindowHours,
    vipSenders: "",
    softRejectMode: "downgrade_only",
    softRejectNotes: "",
    noiseSources: "",
    notes: "",
  };
}

function defaultArtifacts(userId: string, sourceId: string): MailPersonalizationArtifact[] {
  const scope = personalizationScopeHash(userId, sourceId);
  return [
    {
      key: "guide",
      label: "个性化判据文档",
      path: profileMarkdownPath(userId, sourceId),
    },
    {
      key: "json",
      label: "个性化判据 JSON",
      path: profileJsonPath(userId, sourceId),
    },
    {
      key: "learning",
      label: "行为学习文档",
      path: join(personalizationDir, `${scope}.learning.md`),
    },
    {
      key: "learning_json",
      label: "行为学习 JSON",
      path: join(personalizationDir, `${scope}.learning.json`),
    },
    {
      key: "overrides",
      label: "手动覆盖文档",
      path: join(personalizationDir, `${scope}.overrides.md`),
    },
    {
      key: "overrides_json",
      label: "手动覆盖 JSON",
      path: join(personalizationDir, `${scope}.overrides.json`),
    },
    {
      key: "resolved",
      label: "生效判据文档",
      path: join(personalizationDir, `${scope}.resolved.md`),
    },
    {
      key: "resolved_json",
      label: "生效判据 JSON",
      path: join(personalizationDir, `${scope}.resolved.json`),
    },
  ];
}

function trimLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function splitStructuredItems(raw: string): string[] {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const segment of raw.split(/[\n,，;；、]+/)) {
    const cleaned = trimLine(segment);
    if (!cleaned) {
      continue;
    }
    const signature = cleaned.toLowerCase();
    if (seen.has(signature)) {
      continue;
    }
    seen.add(signature);
    output.push(cleaned);
  }

  return output;
}

function normalizeRejectMode(value: string | undefined): MailPersonalizationRejectMode {
  return value === "draft_reject" ? "draft_reject" : "downgrade_only";
}

function normalizeStructuredProfile(
  answers: MailPersonalizationAnswers
): MailPersonalizationStructuredProfile {
  return {
    urgentSignals: splitStructuredItems(answers.urgentSignals),
    hiddenImportantTopics: splitStructuredItems(answers.hiddenImportantTopics),
    deadlineAlertWindowHours: Number.isFinite(answers.deadlineAlertWindowHours)
      ? Math.max(1, Math.min(Math.round(answers.deadlineAlertWindowHours), 24 * 14))
      : defaultDeadlineAlertWindowHours,
    vipSenders: splitStructuredItems(answers.vipSenders),
    softRejectMode: normalizeRejectMode(answers.softRejectMode),
    softRejectNotes: trimLine(answers.softRejectNotes),
    noiseSources: splitStructuredItems(answers.noiseSources),
    notes: splitStructuredItems(answers.notes),
  };
}

function buildSummaryLines(profile: MailPersonalizationStructuredProfile): string[] {
  const lines: string[] = [];

  if (profile.urgentSignals.length > 0) {
    lines.push(`看到 ${profile.urgentSignals.join(" / ")} 这类表达时，优先判断为紧急。`);
  }

  if (profile.hiddenImportantTopics.length > 0) {
    lines.push(`即使标题普通，只要提到 ${profile.hiddenImportantTopics.join(" / ")}，也要提升重要度。`);
  }

  lines.push(`距离 DDL 或会议还剩 ${profile.deadlineAlertWindowHours} 小时内，就进入强提醒窗口。`);

  if (profile.vipSenders.length > 0) {
    lines.push(`来自 ${profile.vipSenders.join(" / ")} 的邮件默认优先级更高。`);
  }

  if (profile.noiseSources.length > 0) {
    lines.push(`把 ${profile.noiseSources.join(" / ")} 视为低信号噪音来源，默认降权处理。`);
  }

  if (profile.softRejectNotes) {
    const modeLabel =
      profile.softRejectMode === "draft_reject" ? "优先生成委婉拒绝草稿" : "优先降级到低优先级队列";
    lines.push(`对不想接的请求，${modeLabel}。参考语境：${profile.softRejectNotes}`);
  }

  if (profile.notes.length > 0) {
    lines.push(`补充偏好：${profile.notes.join(" / ")}`);
  }

  return lines;
}

function buildDefaultProfile(userId: string, sourceId: string): MailPersonalizationProfile {
  const nowIso = new Date().toISOString();
  const answers = defaultAnswers();
  const profile = normalizeStructuredProfile(answers);

  return {
    profileId: `mp_${personalizationScopeHash(userId, sourceId)}`,
    sourceId,
    completed: false,
    createdAt: nowIso,
    updatedAt: nowIso,
    answers,
    profile,
    summaryLines: buildSummaryLines(profile),
    artifacts: defaultArtifacts(userId, sourceId),
  };
}

function sanitizePersistedProfile(
  raw: PersistedMailPersonalizationProfile | null,
  userId: string,
  sourceId: string
): MailPersonalizationProfile {
  if (!raw || raw.sourceId !== sourceId) {
    return buildDefaultProfile(userId, sourceId);
  }

  const answers: MailPersonalizationAnswers = {
    ...defaultAnswers(),
    ...(raw.answers ?? {}),
    deadlineAlertWindowHours:
      raw.answers && Number.isFinite(raw.answers.deadlineAlertWindowHours)
        ? Math.max(1, Math.min(Math.round(raw.answers.deadlineAlertWindowHours), 24 * 14))
        : defaultDeadlineAlertWindowHours,
    softRejectMode: normalizeRejectMode(raw.answers?.softRejectMode),
  };
  const profile = normalizeStructuredProfile(answers);

  return {
    profileId: raw.profileId || `mp_${personalizationScopeHash(userId, sourceId)}`,
    sourceId,
    completed: Boolean(raw.completed),
    createdAt: raw.createdAt || new Date().toISOString(),
    updatedAt: raw.updatedAt || raw.createdAt || new Date().toISOString(),
    answers,
    profile,
    summaryLines: raw.summaryLines?.length ? raw.summaryLines : buildSummaryLines(profile),
    artifacts: defaultArtifacts(userId, sourceId),
  };
}

function buildMarkdownDocument(record: MailPersonalizationProfile): string {
  const lines = [
    "# 个性化判据文档",
    "",
    `- Profile ID: ${record.profileId}`,
    `- Source ID: ${record.sourceId}`,
    `- Completed: ${record.completed ? "yes" : "no"}`,
    `- Updated At: ${record.updatedAt}`,
    "",
    "## 判据摘要",
    "",
    ...(record.summaryLines.length > 0 ? record.summaryLines.map((line) => `- ${line}`) : ["- 暂无摘要"]),
    "",
    "## 原始回答",
    "",
    `### 什么会触发“紧急”雷达`,
    record.answers.urgentSignals || "_未填写_",
    "",
    `### 哪些隐藏主题会自动升高重要度`,
    record.answers.hiddenImportantTopics || "_未填写_",
    "",
    `### 你对时间窗口的容忍度`,
    `${record.answers.deadlineAlertWindowHours} 小时`,
    "",
    `### 哪些人必须优先处理`,
    record.answers.vipSenders || "_未填写_",
    "",
    `### 遇到想婉拒的请求时`,
    record.answers.softRejectMode === "draft_reject"
      ? "倾向生成委婉拒绝草稿"
      : "倾向直接降到低优先级队列",
    record.answers.softRejectNotes || "_未填写_",
    "",
    `### 哪些来源属于纯噪音`,
    record.answers.noiseSources || "_未填写_",
    "",
    `### 其他补充`,
    record.answers.notes || "_未填写_",
    "",
    "## 结构化结果",
    "",
    "```json",
    JSON.stringify(record.profile, null, 2),
    "```",
    "",
  ];

  return `${lines.join("\n")}\n`;
}

async function writeMarkdownProfile(userId: string, sourceId: string, record: MailPersonalizationProfile): Promise<void> {
  const path = profileMarkdownPath(userId, sourceId);
  await ensureParentDirectory(path);
  const tempPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, buildMarkdownDocument(record), "utf8");
  await rename(tempPath, path);
}

export async function getMailPersonalizationProfile(
  userId: string,
  sourceId: string
): Promise<MailPersonalizationProfile> {
  const raw = await readJsonFile<PersistedMailPersonalizationProfile | null>(profileJsonPath(userId, sourceId), null);
  return sanitizePersistedProfile(raw, userId, sourceId);
}

export async function saveMailPersonalizationProfile(
  userId: string,
  sourceId: string,
  input: MailPersonalizationSaveInput
): Promise<MailPersonalizationProfile> {
  const current = await getMailPersonalizationProfile(userId, sourceId);
  const {
    completed: completedValue,
    deadlineAlertWindowHours,
    softRejectMode,
    ...partialAnswers
  } = input;
  const nextAnswers: MailPersonalizationAnswers = {
    ...current.answers,
    ...partialAnswers,
    deadlineAlertWindowHours:
      deadlineAlertWindowHours !== undefined
        ? Math.max(1, Math.min(Math.round(deadlineAlertWindowHours), 24 * 14))
        : current.answers.deadlineAlertWindowHours,
    softRejectMode:
      softRejectMode !== undefined ? normalizeRejectMode(softRejectMode) : current.answers.softRejectMode,
  };
  const nextProfile = normalizeStructuredProfile(nextAnswers);
  const nextRecord: MailPersonalizationProfile = {
    ...current,
    completed: completedValue ?? current.completed,
    updatedAt: new Date().toISOString(),
    answers: nextAnswers,
    profile: nextProfile,
    summaryLines: buildSummaryLines(nextProfile),
    artifacts: defaultArtifacts(userId, sourceId),
  };
  const persisted: PersistedMailPersonalizationProfile = {
    ...nextRecord,
    version: 1,
    userScope: personalizationUserScope(userId),
  };

  await writeMarkdownProfile(userId, sourceId, nextRecord);
  await writeJsonFile(profileJsonPath(userId, sourceId), persisted);
  return nextRecord;
}

export async function getMailPersonalizationRuntimeProfile(
  userId: string | undefined,
  sourceId: string | undefined
): Promise<MailPersonalizationRuntimeProfile | null> {
  if (!userId || !sourceId) {
    return null;
  }

  const profile = await getMailPersonalizationProfile(userId, sourceId);
  const hasSignals =
    profile.profile.urgentSignals.length > 0 ||
    profile.profile.hiddenImportantTopics.length > 0 ||
    profile.profile.deadlineAlertWindowHours !== defaultDeadlineAlertWindowHours ||
    profile.profile.vipSenders.length > 0 ||
    profile.profile.noiseSources.length > 0 ||
    profile.profile.notes.length > 0 ||
    Boolean(profile.profile.softRejectNotes);

  if (!profile.completed && !hasSignals) {
    return null;
  }

  return {
    ...profile.profile,
    completed: profile.completed,
    profileId: profile.profileId,
    summaryLines: profile.summaryLines,
  };
}
