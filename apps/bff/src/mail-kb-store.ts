import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type {
  EventCluster,
  KnowledgeBaseStats,
  MailKnowledgeRecord,
  MailQuadrant,
  MailScoreScale,
  MailScoreIndex,
  MailSubjectIndex,
  PersonProfile,
} from "@mail-agent/shared-types";
import { runtimePaths } from "./runtime/paths.js";

type MailKnowledgeStoreCacheKey = `${string}:${string}`;

export type MailKnowledgeBaselineStatus = {
  backfillCompleted: boolean;
  exportedAt: string;
  userId: string;
  sourceId: string;
  mailCount: number;
  eventCount: number;
  personCount: number;
  note: string;
};

export type MailKnowledgeBasePaths = {
  rootDir: string;
  tenantDir: string;
  dataDir: string;
  mailsDir: string;
  eventsDir: string;
  personsDir: string;
  documentsDir: string;
  mailIndexPath: string;
  eventIndexPath: string;
  personIndexPath: string;
  baselineStatusPath: string;
  exportReportPath: string;
  mailIdsDocPath: string;
  mailSubjectDocPath: string;
  mailScoreDocPath: string;
  mailSummaryDocPath: string;
  eventDocPath: string;
  senderDocPath: string;
};

type MailUpsertInput = Omit<MailKnowledgeRecord, "processedAt"> & {
  processedAt?: string;
};

type EventUpsertInput = Omit<EventCluster, "lastUpdated"> & {
  lastUpdated?: string;
};

type PersonUpsertInput = Omit<PersonProfile, "lastUpdated"> & {
  lastUpdated?: string;
};

function stableHash(input: string): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 24);
}

function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true });
}

function readJson<T>(filePath: string, fallback: T): T {
  try {
    if (!existsSync(filePath)) {
      return fallback;
    }
    return JSON.parse(readFileSync(filePath, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

function writeJson(filePath: string, data: unknown): void {
  ensureDir(dirname(filePath));
  writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
}

function normalizeDate(value: string | undefined, fallback = new Date()): string {
  const parsed = value ? new Date(value) : fallback;
  if (Number.isNaN(parsed.getTime())) {
    return fallback.toISOString();
  }
  return parsed.toISOString();
}

function toQuadrant(importanceScore: number, urgencyScore: number): MailQuadrant {
  if (!Number.isFinite(importanceScore) || !Number.isFinite(urgencyScore)) {
    return "unprocessed";
  }
  if (importanceScore <= 0 && urgencyScore <= 0) {
    return "unprocessed";
  }
  const important = importanceScore >= 0.7 || importanceScore >= 7;
  const urgent = urgencyScore >= 0.7 || urgencyScore >= 7;
  if (important && urgent) return "urgent_important";
  if (important) return "not_urgent_important";
  if (urgent) return "urgent_not_important";
  return "not_urgent_not_important";
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

function normalizeMailQuadrant(
  value: unknown,
  importanceScore: number,
  urgencyScore: number
): MailQuadrant {
  return isMailQuadrant(value) ? value : toQuadrant(importanceScore, urgencyScore);
}

function normalizeMailScoreScale(
  value: unknown,
  importanceScore: number,
  urgencyScore: number
): MailScoreScale {
  if (value === "ratio" || value === "ten") {
    return value;
  }
  return importanceScore > 1 || urgencyScore > 1 ? "ten" : "ratio";
}

function normalizeMailRecord(record: MailKnowledgeRecord): MailKnowledgeRecord {
  return {
    ...record,
    scoreScale: normalizeMailScoreScale(record.scoreScale, record.importanceScore, record.urgencyScore),
    quadrant: normalizeMailQuadrant(record.quadrant, record.importanceScore, record.urgencyScore),
  };
}

function dedupeStrings(values: Iterable<string>): string[] {
  const seen = new Set<string>();
  const results: string[] = [];
  for (const raw of values) {
    const value = raw.trim();
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    results.push(value);
  }
  return results;
}

export function resolveMailKnowledgeBasePaths(
  userId: string,
  sourceId: string
): MailKnowledgeBasePaths {
  const rootDir = process.env.KB_DATA_DIR?.trim()
    ? process.env.KB_DATA_DIR.trim()
    : join(runtimePaths.dataDir, "mail-kb");
  const tenantDir = join(rootDir, stableHash(userId), stableHash(sourceId));
  const dataDir = join(tenantDir, "data");
  const mailsDir = join(dataDir, "mails");
  const eventsDir = join(dataDir, "events");
  const personsDir = join(dataDir, "persons");
  const documentsDir = join(dataDir, "documents");
  return {
    rootDir,
    tenantDir,
    dataDir,
    mailsDir,
    eventsDir,
    personsDir,
    documentsDir,
    mailIndexPath: join(mailsDir, "index.json"),
    eventIndexPath: join(eventsDir, "index.json"),
    personIndexPath: join(personsDir, "index.json"),
    baselineStatusPath: join(documentsDir, "baseline-status.json"),
    exportReportPath: join(documentsDir, "export-report.json"),
    mailIdsDocPath: join(documentsDir, "mail-ids.md"),
    mailSubjectDocPath: join(documentsDir, "mail-subject-index.md"),
    mailScoreDocPath: join(documentsDir, "mail-score-index.md"),
    mailSummaryDocPath: join(documentsDir, "mail-summaries.md"),
    eventDocPath: join(documentsDir, "event-clusters.md"),
    senderDocPath: join(documentsDir, "sender-profiles.md"),
  };
}

export class FileMailKnowledgeBaseStore {
  private readonly paths: MailKnowledgeBasePaths;
  private initialized = false;
  private readonly mails = new Map<string, MailKnowledgeRecord>();
  private readonly mailIdByRawId = new Map<string, string>();
  private readonly events = new Map<string, EventCluster>();
  private readonly persons = new Map<string, PersonProfile>();
  private readonly personIdByEmail = new Map<string, string>();

  constructor(
    readonly userId: string,
    readonly sourceId: string
  ) {
    this.paths = resolveMailKnowledgeBasePaths(userId, sourceId);
  }

  getPaths(): MailKnowledgeBasePaths {
    return this.paths;
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }
    ensureDir(this.paths.mailsDir);
    ensureDir(this.paths.eventsDir);
    ensureDir(this.paths.personsDir);
    ensureDir(this.paths.documentsDir);

    const mailIndex = readJson<Record<string, MailKnowledgeRecord>>(this.paths.mailIndexPath, {});
    for (const [mailId, record] of Object.entries(mailIndex)) {
      this.mails.set(mailId, record);
      this.mailIdByRawId.set(record.rawId, mailId);
    }

    const eventIndex = readJson<Record<string, EventCluster>>(this.paths.eventIndexPath, {});
    for (const [eventId, record] of Object.entries(eventIndex)) {
      this.events.set(eventId, record);
    }

    const personIndex = readJson<Record<string, PersonProfile>>(this.paths.personIndexPath, {});
    for (const [personId, record] of Object.entries(personIndex)) {
      this.persons.set(personId, record);
      this.personIdByEmail.set(record.email.trim().toLowerCase(), personId);
    }

    this.initialized = true;
  }

  getMailByRawId(rawId: string): MailKnowledgeRecord | null {
    const mailId = this.mailIdByRawId.get(rawId);
    if (!mailId) {
      return null;
    }
    const record = this.mails.get(mailId) ?? null;
    return record ? normalizeMailRecord(record) : null;
  }

  getMailById(mailId: string): MailKnowledgeRecord | null {
    const record = this.mails.get(mailId) ?? null;
    return record ? normalizeMailRecord(record) : null;
  }

  getEventById(eventId: string): EventCluster | null {
    return this.events.get(eventId) ?? null;
  }

  getPersonById(personId: string): PersonProfile | null {
    return this.persons.get(personId) ?? null;
  }

  getPersonByEmail(email: string): PersonProfile | null {
    const personId = this.personIdByEmail.get(email.trim().toLowerCase());
    if (!personId) {
      return null;
    }
    return this.persons.get(personId) ?? null;
  }

  upsertMail(input: MailUpsertInput): { record: MailKnowledgeRecord; created: boolean } {
    const existingMail =
      this.mails.get(input.mailId) ??
      (input.rawId ? this.getMailByRawId(input.rawId) : null);
    const processedAt = normalizeDate(input.processedAt);
    const knowledgeCard = input.knowledgeCard ?? existingMail?.knowledgeCard;
    const record: MailKnowledgeRecord = {
      mailId: existingMail?.mailId ?? input.mailId,
      rawId: input.rawId,
      subject: input.subject,
      personId: input.personId,
      eventId: input.eventId,
      importanceScore: input.importanceScore,
      urgencyScore: input.urgencyScore,
      scoreScale: normalizeMailScoreScale(input.scoreScale, input.importanceScore, input.urgencyScore),
      quadrant: normalizeMailQuadrant(input.quadrant, input.importanceScore, input.urgencyScore),
      summary: input.summary,
      receivedAt: normalizeDate(input.receivedAt),
      processedAt,
      ...(input.webLink ? { webLink: input.webLink } : {}),
      ...(knowledgeCard ? { knowledgeCard } : {}),
    };

    this.mails.set(record.mailId, record);
    this.mailIdByRawId.set(record.rawId, record.mailId);
    this.saveMails();
    return { record, created: !existingMail };
  }

  markKnowledgeCard(
    mailIdOrRawId: string,
    tags: string[],
    savedAt = new Date().toISOString()
  ): MailKnowledgeRecord | null {
    const existing =
      this.mails.get(mailIdOrRawId) ??
      this.getMailByRawId(mailIdOrRawId);
    if (!existing) {
      return null;
    }

    const record: MailKnowledgeRecord = normalizeMailRecord({
      ...existing,
      knowledgeCard: {
        savedAt: normalizeDate(savedAt),
        tags: dedupeStrings([...(existing.knowledgeCard?.tags ?? []), ...tags]),
      },
    });
    this.mails.set(record.mailId, record);
    this.mailIdByRawId.set(record.rawId, record.mailId);
    this.saveMails();
    return record;
  }

  upsertEvent(input: EventUpsertInput): { record: EventCluster; created: boolean } {
    const existing = this.events.get(input.eventId) ?? null;
    const record: EventCluster = {
      eventId: input.eventId,
      name: input.name || existing?.name || "未命名事件",
      summary: input.summary || existing?.summary || "暂无事件摘要",
      keyInfo: dedupeStrings([...(existing?.keyInfo ?? []), ...(input.keyInfo ?? [])]),
      relatedMailIds: dedupeStrings([...(existing?.relatedMailIds ?? []), ...(input.relatedMailIds ?? [])]),
      lastUpdated: normalizeDate(input.lastUpdated),
      tags: dedupeStrings([...(existing?.tags ?? []), ...(input.tags ?? [])]),
    };
    this.events.set(record.eventId, record);
    this.saveEvents();
    return { record, created: !existing };
  }

  upsertPerson(input: PersonUpsertInput): { record: PersonProfile; created: boolean } {
    const normalizedEmail = input.email.trim().toLowerCase();
    const existing =
      this.persons.get(input.personId) ??
      this.getPersonByEmail(normalizedEmail);
    const record: PersonProfile = {
      personId: existing?.personId ?? input.personId,
      email: normalizedEmail,
      name: input.name || existing?.name || normalizedEmail || "未知发件人",
      profile: input.profile || existing?.profile || "暂无人物画像摘要",
      role: input.role || existing?.role || "未标注",
      importance: Math.max(existing?.importance ?? 0, input.importance),
      recentInteractions: Math.max(input.recentInteractions, existing?.recentInteractions ?? 0),
      lastUpdated: normalizeDate(input.lastUpdated),
      ...(input.avatarUrl ? { avatarUrl: input.avatarUrl } : existing?.avatarUrl ? { avatarUrl: existing.avatarUrl } : {}),
    };
    this.persons.set(record.personId, record);
    this.personIdByEmail.set(record.email, record.personId);
    this.savePersons();
    return { record, created: !existing };
  }

  getAllMails(limit?: number): MailKnowledgeRecord[] {
    const rows = Array.from(this.mails.values()).map(normalizeMailRecord).sort(
      (left, right) => new Date(right.receivedAt).getTime() - new Date(left.receivedAt).getTime()
    );
    return typeof limit === "number" ? rows.slice(0, limit) : rows;
  }

  getAllEvents(): EventCluster[] {
    return Array.from(this.events.values()).sort(
      (left, right) => new Date(right.lastUpdated).getTime() - new Date(left.lastUpdated).getTime()
    );
  }

  getAllPersons(): PersonProfile[] {
    return Array.from(this.persons.values()).sort(
      (left, right) => right.recentInteractions - left.recentInteractions
    );
  }

  getAllSubjectIndexes(): MailSubjectIndex[] {
    return this.getAllMails().map((mail) => ({
      mailId: mail.mailId,
      subject: mail.subject,
      receivedAt: mail.receivedAt,
    }));
  }

  getAllScoreIndexes(): MailScoreIndex[] {
    return this.getAllMails().map((mail) => ({
      mailId: mail.mailId,
      importanceScore: mail.importanceScore,
      urgencyScore: mail.urgencyScore,
      scoreScale: normalizeMailScoreScale(mail.scoreScale, mail.importanceScore, mail.urgencyScore),
      quadrant: normalizeMailQuadrant(mail.quadrant, mail.importanceScore, mail.urgencyScore),
      timestamp: mail.processedAt,
    }));
  }

  getStats(): KnowledgeBaseStats {
    const quadrantDistribution: Record<MailQuadrant, number> = {
      unprocessed: 0,
      urgent_important: 0,
      not_urgent_important: 0,
      urgent_not_important: 0,
      not_urgent_not_important: 0,
    };

    for (const mail of this.mails.values()) {
      const quadrant = normalizeMailQuadrant(mail.quadrant, mail.importanceScore, mail.urgencyScore);
      quadrantDistribution[quadrant] += 1;
    }

    const dates = Array.from(this.mails.values()).map((mail) => new Date(mail.receivedAt).getTime());
    return {
      totalMails: this.mails.size,
      totalEvents: this.events.size,
      totalPersons: this.persons.size,
      processedAt: new Date().toISOString(),
      dateRange: {
        start: dates.length > 0 ? new Date(Math.min(...dates)).toISOString() : "",
        end: dates.length > 0 ? new Date(Math.max(...dates)).toISOString() : "",
      },
      quadrantDistribution,
    };
  }

  readBaselineStatus(): MailKnowledgeBaselineStatus | null {
    return readJson<MailKnowledgeBaselineStatus | null>(this.paths.baselineStatusPath, null);
  }

  private saveMails(): void {
    const index: Record<string, MailKnowledgeRecord> = {};
    for (const [mailId, record] of this.mails.entries()) {
      index[mailId] = record;
      writeJson(join(this.paths.mailsDir, `${mailId}.json`), record);
    }
    writeJson(this.paths.mailIndexPath, index);
  }

  private saveEvents(): void {
    const index: Record<string, EventCluster> = {};
    for (const [eventId, record] of this.events.entries()) {
      index[eventId] = record;
    }
    writeJson(this.paths.eventIndexPath, index);
  }

  private savePersons(): void {
    const index: Record<string, PersonProfile> = {};
    for (const [personId, record] of this.persons.entries()) {
      index[personId] = record;
    }
    writeJson(this.paths.personIndexPath, index);
  }
}

const kbStoreCache = new Map<MailKnowledgeStoreCacheKey, FileMailKnowledgeBaseStore>();

export async function getMailKnowledgeBaseStore(
  userId: string,
  sourceId: string
): Promise<FileMailKnowledgeBaseStore> {
  const key: MailKnowledgeStoreCacheKey = `${userId}:${sourceId}`;
  let store = kbStoreCache.get(key);
  if (!store) {
    store = new FileMailKnowledgeBaseStore(userId, sourceId);
    kbStoreCache.set(key, store);
  }
  await store.initialize();
  return store;
}
