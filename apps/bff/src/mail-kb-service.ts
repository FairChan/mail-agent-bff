/**
 * Mail Knowledge Base Data Service
 * 邮件知识库核心数据管理服务
 * 负责邮件、事件、人物的存储、检索和聚类
 * 
 * 版本历史:
 * - 2026-04-13: 统一评分标准为 0-1，添加 keyInfo 字段，修复版本控制
 */

import { z } from "zod";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

// ========== 常量定义 ==========

const KB_DATA_DIR = join(process.env.KB_DATA_DIR ?? "/root/.openclaw/workspace/mail-kb", "data");
const MAILS_DIR = join(KB_DATA_DIR, "mails");
const EVENTS_DIR = join(KB_DATA_DIR, "events");
const PERSONS_DIR = join(KB_DATA_DIR, "persons");

// ========== Zod Schemas ==========

export const mailQuadrantSchema = z.enum([
  "unprocessed",
  "urgent_important",
  "not_urgent_important",
  "urgent_not_important",
  "not_urgent_not_important",
]);

export const mailKnowledgeRecordSchema = z.object({
  mailId: z.string(),
  rawId: z.string(),
  subject: z.string(),
  personId: z.string(),
  eventId: z.string().nullable(),
  importanceScore: z.number().min(0).max(1),
  urgencyScore: z.number().min(0).max(1),
  quadrant: mailQuadrantSchema,
  summary: z.string(),
  receivedAt: z.string(),
  processedAt: z.string(),
  webLink: z.string().optional(),
});

export const eventClusterSchema = z.object({
  eventId: z.string(),
  name: z.string(),
  summary: z.string(),
  keyInfo: z.array(z.string()),
  relatedMailIds: z.array(z.string()),
  lastUpdated: z.string(),
  tags: z.array(z.string()),
});

export const personProfileSchema = z.object({
  personId: z.string(),
  email: z.string(),
  name: z.string(),
  profile: z.string(),
  role: z.string(),
  keyInfo: z.array(z.string()),
  importance: z.number().min(0).max(1),
  recentInteractions: z.number(),
  lastUpdated: z.string(),
  avatarUrl: z.string().optional(),
});

// ========== 类型定义 ==========

export type MailQuadrantKB = z.infer<typeof mailQuadrantSchema>;
export type MailKnowledgeRecord = z.infer<typeof mailKnowledgeRecordSchema>;
export type EventCluster = z.infer<typeof eventClusterSchema>;
export type PersonProfile = z.infer<typeof personProfileSchema>;

export interface MailSubjectIndex {
  mailId: string;
  subject: string;
  receivedAt: string;
}

export interface MailScoreIndex {
  mailId: string;
  importanceScore: number;
  urgencyScore: number;
  quadrant: MailQuadrantKB;
  timestamp: string;
}

// ========== 工具函数 ==========

function ensureDir(dirPath: string): void {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}

function readJsonFile<T>(filePath: string, defaultValue: T): T {
  try {
    if (existsSync(filePath)) {
      const content = readFileSync(filePath, "utf-8");
      return JSON.parse(content) as T;
    }
  } catch (error) {
    console.error(`Failed to read ${filePath}:`, error);
  }
  return defaultValue;
}

function writeJsonFile<T>(filePath: string, data: T): void {
  try {
    ensureDir(dirname(filePath));
    writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
  } catch (error) {
    console.error(`Failed to write ${filePath}:`, error);
    throw error;
  }
}

function generateId(prefix: string): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hour = String(now.getHours()).padStart(2, "0");
  const minute = String(now.getMinutes()).padStart(2, "0");
  const second = String(now.getSeconds()).padStart(2, "0");
  const ms = String(now.getMilliseconds()).padStart(3, "0");
  const random = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
  return `${prefix}-${year}${month}${day}${hour}${minute}${second}${ms}${random}`;
}

// ========== 邮件知识库类 ==========

class MailKnowledgeBase {
  private mails: Map<string, MailKnowledgeRecord> = new Map();
  private events: Map<string, EventCluster> = new Map();
  private persons: Map<string, PersonProfile> = new Map();
  private subjects: Map<string, MailSubjectIndex> = new Map();
  private scores: Map<string, MailScoreIndex> = new Map();
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    ensureDir(KB_DATA_DIR);
    ensureDir(MAILS_DIR);
    ensureDir(EVENTS_DIR);
    ensureDir(PERSONS_DIR);

    const mailsIndexPath = join(MAILS_DIR, "index.json");
    const mailsIndex = readJsonFile<Record<string, MailKnowledgeRecord>>(mailsIndexPath, {});
    for (const [id, record] of Object.entries(mailsIndex)) {
      this.mails.set(id, record);
      this.subjects.set(id, {
        mailId: id,
        subject: record.subject,
        receivedAt: record.receivedAt,
      });
      this.scores.set(id, {
        mailId: id,
        importanceScore: record.importanceScore,
        urgencyScore: record.urgencyScore,
        quadrant: record.quadrant,
        timestamp: record.receivedAt,
      });
    }

    const eventsIndexPath = join(EVENTS_DIR, "index.json");
    const eventsIndex = readJsonFile<Record<string, EventCluster>>(eventsIndexPath, {});
    for (const [id, record] of Object.entries(eventsIndex)) {
      this.events.set(id, record);
    }

    const personsIndexPath = join(PERSONS_DIR, "index.json");
    const personsIndex = readJsonFile<Record<string, PersonProfile>>(personsIndexPath, {});
    for (const [id, record] of Object.entries(personsIndex)) {
      this.persons.set(id, record);
    }

    this.initialized = true;
    console.log(`[MailKB] Initialized: ${this.mails.size} mails, ${this.events.size} events, ${this.persons.size} persons`);
  }

  private saveMailsIndex(): void {
    const index: Record<string, MailKnowledgeRecord> = {};
    this.mails.forEach((record, id) => {
      index[id] = record;
    });
    writeJsonFile(join(MAILS_DIR, "index.json"), index);
  }

  private saveEventsIndex(): void {
    const index: Record<string, EventCluster> = {};
    this.events.forEach((record, id) => {
      index[id] = record;
    });
    writeJsonFile(join(EVENTS_DIR, "index.json"), index);
  }

  private savePersonsIndex(): void {
    const index: Record<string, PersonProfile> = {};
    this.persons.forEach((record, id) => {
      index[id] = record;
    });
    writeJsonFile(join(PERSONS_DIR, "index.json"), index);
  }

  private saveMailDetail(mail: MailKnowledgeRecord): void {
    const detailPath = join(MAILS_DIR, `${mail.mailId}.json`);
    writeJsonFile(detailPath, mail);
  }

  addMail(record: Omit<MailKnowledgeRecord, "mailId" | "processedAt">): MailKnowledgeRecord {
    const mailId = generateId("MAIL");
    const fullRecord: MailKnowledgeRecord = {
      ...record,
      mailId,
      processedAt: new Date().toISOString(),
    };

    this.mails.set(mailId, fullRecord);
    this.subjects.set(mailId, {
      mailId,
      subject: record.subject,
      receivedAt: record.receivedAt,
    });
    this.scores.set(mailId, {
      mailId,
      importanceScore: record.importanceScore,
      urgencyScore: record.urgencyScore,
      quadrant: record.quadrant,
      timestamp: record.receivedAt,
    });

    this.saveMailsIndex();
    this.saveMailDetail(fullRecord);

    if (fullRecord.eventId) {
      const event = this.events.get(fullRecord.eventId);
      if (event && !event.relatedMailIds.includes(mailId)) {
        event.relatedMailIds.push(mailId);
        event.lastUpdated = new Date().toISOString();
        this.saveEventsIndex();
      }
    }

    return fullRecord;
  }

  upsertEvent(record: Omit<EventCluster, "eventId" | "lastUpdated" | "relatedMailIds">): EventCluster {
    const existingEvent = this.findEventByName(record.name);
    if (existingEvent) {
      const existingKeyInfoSet = new Set(existingEvent.keyInfo);
      record.keyInfo.forEach(info => existingKeyInfoSet.add(info));
      existingEvent.keyInfo = Array.from(existingKeyInfoSet);

      const existingTagsSet = new Set(existingEvent.tags);
      record.tags?.forEach(tag => existingTagsSet.add(tag));
      existingEvent.tags = Array.from(existingTagsSet);

      if (record.summary && record.summary !== existingEvent.summary) {
        const timestamp = new Date().toISOString().split("T")[0];
        existingEvent.summary = `[${timestamp}] ${record.summary}\n\n---\n[历史] ${existingEvent.summary.slice(0, 200)}`;
      }

      existingEvent.lastUpdated = new Date().toISOString();
      this.saveEventsIndex();
      return existingEvent;
    }

    const eventId = generateId("EVT");
    const newEvent: EventCluster = {
      ...record,
      eventId,
      relatedMailIds: [],
      lastUpdated: new Date().toISOString(),
    };
    this.events.set(eventId, newEvent);
    this.saveEventsIndex();
    return newEvent;
  }

  upsertPerson(record: Omit<PersonProfile, "personId" | "lastUpdated" | "recentInteractions">): PersonProfile {
    const existingPerson = this.findPersonByEmail(record.email);
    if (existingPerson) {
      const existingKeyInfoSet = new Set(existingPerson.keyInfo);
      record.keyInfo?.forEach(info => existingKeyInfoSet.add(info));
      existingPerson.keyInfo = Array.from(existingKeyInfoSet);

      if (record.profile && record.profile !== existingPerson.profile) {
        const timestamp = new Date().toISOString().split("T")[0];
        existingPerson.profile = `[${timestamp}] ${record.profile}\n\n---\n[历史] ${existingPerson.profile.slice(0, 200)}`;
      }

      if (record.role) existingPerson.role = record.role;
      existingPerson.importance = Math.max(existingPerson.importance, record.importance);
      existingPerson.recentInteractions += 1;
      existingPerson.lastUpdated = new Date().toISOString();
      this.savePersonsIndex();
      return existingPerson;
    }

    const personId = generateId("PRS");
    const newPerson: PersonProfile = {
      ...record,
      personId,
      recentInteractions: 1,
      lastUpdated: new Date().toISOString(),
    };
    this.persons.set(personId, newPerson);
    this.savePersonsIndex();
    return newPerson;
  }

  findEventByName(name: string): EventCluster | undefined {
    for (const event of this.events.values()) {
      if (event.name.toLowerCase().includes(name.toLowerCase()) ||
          name.toLowerCase().includes(event.name.toLowerCase())) {
        return event;
      }
    }
    return undefined;
  }

  findPersonByEmail(email: string): PersonProfile | undefined {
    for (const person of this.persons.values()) {
      if (person.email.toLowerCase() === email.toLowerCase()) {
        return person;
      }
    }
    return undefined;
  }

  getAllMails(): MailKnowledgeRecord[] {
    return Array.from(this.mails.values()).sort(
      (a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()
    );
  }

  getAllEvents(): EventCluster[] {
    return Array.from(this.events.values()).sort(
      (a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime()
    );
  }

  getAllPersons(): PersonProfile[] {
    return Array.from(this.persons.values()).sort(
      (a, b) => b.recentInteractions - a.recentInteractions
    );
  }

  getMail(mailId: string): MailKnowledgeRecord | undefined {
    return this.mails.get(mailId);
  }

  getEvent(eventId: string): EventCluster | undefined {
    return this.events.get(eventId);
  }

  getPerson(personId: string): PersonProfile | undefined {
    return this.persons.get(personId);
  }

  getAllSubjects(): MailSubjectIndex[] {
    return Array.from(this.subjects.values()).sort(
      (a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()
    );
  }

  getAllScores(): MailScoreIndex[] {
    return Array.from(this.scores.values()).sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  getStats() {
    const quadrantCounts: Record<MailQuadrantKB, number> = {
      unprocessed: 0,
      urgent_important: 0,
      not_urgent_important: 0,
      urgent_not_important: 0,
      not_urgent_not_important: 0,
    };

    this.scores.forEach((score) => {
      quadrantCounts[score.quadrant]++;
    });

    const allDates = Array.from(this.mails.values()).map((m) => new Date(m.receivedAt).getTime());
    const dateRange = {
      start: allDates.length > 0 ? new Date(Math.min(...allDates)).toISOString() : "",
      end: allDates.length > 0 ? new Date(Math.max(...allDates)).toISOString() : "",
    };

    return {
      totalMails: this.mails.size,
      totalEvents: this.events.size,
      totalPersons: this.persons.size,
      processedAt: new Date().toISOString(),
      dateRange,
      quadrantDistribution: quadrantCounts,
    };
  }

  searchMails(query: string): MailKnowledgeRecord[] {
    const q = query.toLowerCase();
    return this.getAllMails().filter(
      (mail) =>
        mail.subject.toLowerCase().includes(q) ||
        mail.summary.toLowerCase().includes(q)
    );
  }

  getMailsByEvent(eventId: string): MailKnowledgeRecord[] {
    const event = this.events.get(eventId);
    if (!event) return [];
    return event.relatedMailIds
      .map((mailId) => this.mails.get(mailId))
      .filter((mail): mail is MailKnowledgeRecord => mail !== undefined);
  }

  getMailsByPerson(personId: string): MailKnowledgeRecord[] {
    return this.getAllMails().filter((mail) => mail.personId === personId);
  }
}

function legacyGlobalKbDisabledError(): Error {
  return new Error(
    "Legacy global MailKnowledgeBase is disabled. Use getMailKnowledgeBaseStore(userId, sourceId) for tenant-scoped access."
  );
}

export function createLegacyMailKnowledgeBaseForMigration(): MailKnowledgeBase {
  throw legacyGlobalKbDisabledError();
}

export const mailKnowledgeBase = new Proxy({} as MailKnowledgeBase, {
  get() {
    throw legacyGlobalKbDisabledError();
  },
});
