import { createHmac } from "node:crypto";
import { env } from "./config.js";

export const MAIL_PRIVACY_ERROR_CODES = {
  NOT_READY: "MAIL_PRIVACY_NOT_READY",
  MASK_FAILED: "MAIL_PRIVACY_MASK_FAILED",
  RESTORE_FAILED: "MAIL_PRIVACY_RESTORE_FAILED",
} as const;

export type MailPrivacyErrorCode =
  (typeof MAIL_PRIVACY_ERROR_CODES)[keyof typeof MAIL_PRIVACY_ERROR_CODES];

export class MailPrivacyError extends Error {
  constructor(
    readonly code: MailPrivacyErrorCode,
    message: string
  ) {
    super(message);
  }
}

export type MailPrivacyScopeKind =
  | "agent_thread"
  | "agent_query"
  | "ai_summary"
  | "kb_job"
  | "webhook"
  | "legacy_query";

export type MailPrivacyEntityType =
  | "email"
  | "person"
  | "company"
  | "product"
  | "location"
  | "address"
  | "domain"
  | "url"
  | "phone"
  | "identifier"
  | "mailbox_name"
  | "generic";

export type MailPrivacyEntity = {
  value: string;
  type: MailPrivacyEntityType;
};

export type MailPrivacyScopeSnapshot = {
  version: 1;
  kind: MailPrivacyScopeKind;
  scopeId: string;
  userId: string;
  sourceId: string;
  keyVersion: string;
  createdAt: string;
  updatedAt: string;
  mappings: Array<{
    original: string;
    token: string;
    type: MailPrivacyEntityType;
  }>;
};

type CreateMailPrivacyScopeInput = {
  kind: MailPrivacyScopeKind;
  scopeId: string;
  userId: string;
  sourceId: string;
  snapshot?: MailPrivacyScopeSnapshot | null;
};

type PseudonymizeOptions = {
  seedEntities?: Array<MailPrivacyEntity | string | null | undefined>;
};

type StructuredPayloadOptions = {
  seedEntities?: Array<MailPrivacyEntity | string | null | undefined>;
};

type RestoreStructuredPayloadOptions = {
  allowUnknownTokens?: boolean;
};

const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const urlPattern = /\bhttps?:\/\/[^\s<>"')]+/gi;
const domainPattern = /\b(?:[a-z0-9-]+\.)+[a-z]{2,}\b/gi;
const phonePattern = /(?<!\w)(?:\+?\d[\d\s\-()]{6,}\d)(?!\w)/g;
const longNumberPattern = /\b\d{6,}\b/g;
const mixedIdentifierPattern = /\b[A-Z0-9_-]{8,}\b/g;
const englishNamePattern = /\b[A-Z][a-z]{1,20}(?:\s+[A-Z][a-z]{1,20}){1,2}\b/g;
const englishCompanyPattern =
  /\b[A-Z][A-Za-z0-9&.\- ]{1,80}\s(?:Inc|Corp|Corporation|Ltd|LLC|Group|University|College|Lab|Labs|Studio|Systems|Technologies|Technology|AI|Research)\b/g;
const chineseCompanyPattern =
  /[\u4e00-\u9fff]{2,40}(?:公司|集团|大学|学院|研究院|科技|实验室|工作室|中心)/g;
const chinesePersonPattern =
  /(?:欧阳|司马|上官|诸葛|东方|独孤|南宫|夏侯|尉迟|皇甫|长孙|宇文|公孙|令狐|百里|呼延|东郭|南门|羊舌|微生|梁丘|左丘|东门|西门|第五|拓跋|赵|钱|孙|李|周|吴|郑|王|冯|陈|褚|卫|蒋|沈|韩|杨|朱|秦|许|何|吕|施|张|孔|曹|严|华|金|魏|陶|姜|谢|邹|喻|柏|窦|章|云|苏|潘|葛|范|彭|郎|鲁|韦|马|苗|方|俞|任|袁|柳|史|唐|薛|雷|贺|倪|汤|罗|毕|郝|邬|安|常|乐|于|傅|顾|孟|黄|穆|萧|尹|姚|邵|汪|毛|米|明|戴|谈|宋|庞|熊|纪|舒|屈|项|祝|董|梁|杜|阮|蓝|闵|席|季|麻|强|贾|路|江|童|颜|郭|梅|盛|林|钟|徐|邱|骆|高|夏|蔡|田|樊|胡|霍|虞|万|柯|卢|莫|房|解|应|宗|丁|宣|邓|单|杭|洪|包|左|石|崔|龚|程|邢|裴|陆|荣|翁|荀|羊|惠|甄|封|储|靳|邴|松|段|富|巫|乌|焦|巴|牧|隗|山|谷|车|侯|宓|蓬|全|班|仲|宫|宁|栾|暴|甘|厉|戎|武|符|刘|景|束|龙|叶|司|韶|郜|黎|薄|印|白|蒲|从|鄂|索|籍|赖|卓|屠|蒙|池|乔|阴|胥|闻|党|翟|谭|贡|劳|姬|申|扶|堵|冉|郦|雍|却|璩|桑|桂|牛|寿|边|燕|浦|尚|温|庄|晏|柴|瞿|阎|慕|连|茹|习|艾|容|向|古|易|廖|终|暨|步|耿|满|弘|国|文|寇|广|禄|阙|东|利|蔚|越|夔|隆|师|巩|厍|聂|晁|勾|敖|融|冷|訾|辛|阚|那|简|饶|曾|沙|乜|鞠|丰|巢|关|蒯|相|查|后|荆|红|游|竺|权|逯|盖|益|桓)[\u4e00-\u9fff]{1,2}/g;
const chineseAddressPattern =
  /[\u4e00-\u9fff0-9]{2,40}(?:省|市|区|县|镇|乡|街道|大道|路|街|巷|号|楼|室)/g;
const englishAddressPattern =
  /\b\d{1,5}\s+[A-Z][A-Za-z0-9.\- ]{1,60}\s(?:Street|St|Road|Rd|Avenue|Ave|Boulevard|Blvd|Lane|Ln|Drive|Dr|Way|Suite|Ste|Room|Rm)\b/g;
const productPattern =
  /\b(?:[A-Z][A-Za-z0-9]+(?:[- ][A-Z0-9][A-Za-z0-9]+)+|[A-Z]{2,}[A-Za-z0-9-]{2,})\b/g;

const asciiUpperAlphabet = "QWERTYUIOPASDFGHJKLZXCVBNM";
const asciiLowerAlphabet = "qwertyuiopasdfghjklzxcvbnm";
const digitAlphabet = "7319058426";
const hanAlphabet =
  "天地玄黄宇宙洪荒日月盈昃辰宿列张寒来暑往秋收冬藏云腾致雨露结为霜金生丽水玉出昆冈剑号巨阙珠称夜光龙师火帝鸟官人皇始制文字乃服衣裳推位让国有虞陶唐吊民伐罪周发殷汤坐朝问道垂拱平章爱敬存真慎终宜令和安宁平常明正远清雅宁嘉言谨行";
const safeKeyNames = new Set([
  "id",
  "messageId",
  "threadId",
  "sourceId",
  "jobId",
  "routeId",
  "mailId",
  "eventId",
  "senderId",
  "userId",
  "tenantId",
  "connectedAccountId",
  "microsoftAccountId",
  "quadrant",
  "type",
  "status",
  "code",
  "kind",
  "role",
  "phase",
  "model",
  "provider",
  "contentType",
  "timeZone",
  "date",
  "dateKey",
  "horizon",
  "horizonDays",
  "createdAt",
  "updatedAt",
  "receivedAt",
  "receivedDateTime",
  "dueAt",
  "processedAt",
  "startedAt",
  "finishedAt",
  "expiresAt",
]);
const englishNameStopWords = new Set([
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
  "Subject",
  "From",
  "Received",
  "Meeting",
  "Deadline",
  "Project",
  "Reminder",
  "Review",
]);
const englishPersonBoundaryWords = new Set([
  "Mr",
  "Mrs",
  "Ms",
  "Dr",
  "Hi",
  "Hello",
  "Dear",
  "Street",
  "St",
  "Road",
  "Rd",
  "Avenue",
  "Ave",
  "Boulevard",
  "Blvd",
  "Lane",
  "Ln",
  "Drive",
  "Dr",
  "Way",
  "Suite",
  "Ste",
  "Room",
  "Rm",
  "Mail",
  "Pro",
  "Office",
  "Launch",
  "Contract",
  "Product",
]);
const englishCompanyLeadStopWords = new Set([
  "Review",
  "Please",
  "Urgent",
  "Hi",
  "Hello",
  "Dear",
  "Thanks",
  "Thank",
]);
const knownLocationTerms = [
  "Shanghai",
  "Beijing",
  "Shenzhen",
  "Guangzhou",
  "Hangzhou",
  "Hong Kong",
  "Singapore",
  "Tokyo",
  "Osaka",
  "Kyoto",
  "Seoul",
  "San Francisco",
  "New York",
  "Los Angeles",
  "Seattle",
  "Austin",
  "London",
  "Paris",
  "Berlin",
  "Sydney",
  "Melbourne",
  "北京",
  "上海",
  "深圳",
  "广州",
  "杭州",
  "香港",
  "新加坡",
  "东京",
  "大阪",
  "京都",
  "首尔",
  "旧金山",
  "纽约",
  "洛杉矶",
  "西雅图",
  "奥斯汀",
  "伦敦",
  "巴黎",
  "柏林",
  "悉尼",
  "墨尔本",
];
const senderEmailFieldNames = new Set([
  "fromaddress",
  "fromemail",
  "senderemail",
]);
const recipientEmailFieldNames = new Set([
  "toaddress",
  "toemail",
  "recipientemail",
  "ccaddress",
  "ccemail",
  "bccaddress",
  "bccemail",
  "replytoaddress",
  "replytoemail",
]);
const senderAddressPathSegments = new Set([
  "from",
  "sender",
]);
const recipientAddressPathSegments = new Set([
  "to",
  "cc",
  "bcc",
  "replyto",
  "reply_to",
  "recipient",
  "recipients",
  "torecipients",
  "ccrecipients",
  "bccrecipients",
  "replytorecipients",
  "reply_to_recipients",
]);

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeEntityValue(value: string): string {
  const normalized = normalizeWhitespace(value);
  return normalized
    .replace(/^["'([{<\s]+/, "")
    .replace(/["')\]}>.,;:!?，。；：！？\s]+$/u, "")
    .trim();
}

function englishWords(candidate: string): string[] {
  return candidate.split(/\s+/g).filter((word) => word.length > 0);
}

function isLikelyPhoneCandidate(candidate: string): boolean {
  if (/^\d{4}-\d{2}-\d{2}$/.test(candidate)) {
    return false;
  }
  if (/^\d{8}-\d{4,}$/.test(candidate)) {
    return false;
  }
  const digitsOnly = candidate.replace(/\D/g, "");
  if (digitsOnly.length < 7 || digitsOnly.length > 15) {
    return false;
  }
  return /[+\s()]/.test(candidate) || /^\d{3,4}-\d{3,4}-\d{3,4}$/.test(candidate);
}

function isIsoDateCandidate(candidate: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(candidate);
}

function isLikelyEnglishCompany(candidate: string): boolean {
  const words = englishWords(candidate);
  if (words.length < 2) {
    return false;
  }
  return !englishCompanyLeadStopWords.has(words[0] ?? "");
}

function normalizeEnglishCompanyCandidate(candidate: string): string | null {
  const words = englishWords(candidate);
  while (words.length > 1 && englishCompanyLeadStopWords.has(words[0] ?? "")) {
    words.shift();
  }
  if (words.length < 2) {
    return null;
  }
  const normalized = normalizeEntityValue(words.join(" "));
  return isLikelyEnglishCompany(normalized) ? normalized : null;
}

function isLikelyEnglishPerson(candidate: string): boolean {
  const words = englishWords(candidate);
  if (words.length < 2 || words.length > 3) {
    return false;
  }
  if (words.some((word) => englishNameStopWords.has(word) || englishPersonBoundaryWords.has(word))) {
    return false;
  }
  if (words.some((word) => /^[A-Z]{2,}$/.test(word))) {
    return false;
  }
  return true;
}

function normalizeEnglishPersonCandidate(candidate: string): string | null {
  const words = englishWords(candidate);
  while (words.length > 1 && ["Hi", "Hello", "Dear", "Mr", "Mrs", "Ms", "Dr"].includes(words[0] ?? "")) {
    words.shift();
  }
  if (words.length < 2 || words.length > 3) {
    return null;
  }
  const normalized = normalizeEntityValue(words.join(" "));
  return isLikelyEnglishPerson(normalized) ? normalized : null;
}

function isLikelyProductCandidate(candidate: string): boolean {
  if (isIsoDateCandidate(candidate)) {
    return false;
  }
  const words = englishWords(candidate);
  if (words.length === 0) {
    return false;
  }
  if (englishCompanyLeadStopWords.has(words[0] ?? "")) {
    return false;
  }
  const allTitleCaseWords =
    words.length > 1 && words.every((word) => /^[A-Z][a-z]+$/.test(word));
  if (allTitleCaseWords) {
    return false;
  }
  const endsLikeAddress = englishWords(candidate).some((word) =>
    [
      "Street",
      "St",
      "Road",
      "Rd",
      "Avenue",
      "Ave",
      "Boulevard",
      "Blvd",
      "Lane",
      "Ln",
      "Drive",
      "Dr",
      "Way",
    ].includes(word)
  );
  if (endsLikeAddress) {
    return false;
  }
  return true;
}

function detectKnownLocations(text: string, values: MailPrivacyEntity[]): void {
  for (const location of knownLocationTerms) {
    if (!text.includes(location)) {
      continue;
    }
    uniquePush(values, { value: location, type: "location" });
  }
}

function detectEnglishPeople(text: string, values: MailPrivacyEntity[]): void {
  for (const match of text.matchAll(englishNamePattern)) {
    const candidate = normalizeEntityValue(match[0] ?? "");
    if (!candidate || candidate.length < 2) {
      continue;
    }
    const normalized = normalizeEnglishPersonCandidate(candidate);
    if (!normalized) {
      continue;
    }
    uniquePush(values, { value: normalized, type: "person" });
  }
}

function detectEnglishCompanies(text: string, values: MailPrivacyEntity[]): void {
  for (const match of text.matchAll(englishCompanyPattern)) {
    const candidate = normalizeEntityValue(match[0] ?? "");
    if (!candidate || candidate.length < 2) {
      continue;
    }
    const normalized = normalizeEnglishCompanyCandidate(candidate);
    if (!normalized) {
      continue;
    }
    uniquePush(values, { value: normalized, type: "company" });
  }
}

function uniquePush(values: MailPrivacyEntity[], entity: MailPrivacyEntity | null): void {
  if (!entity) {
    return;
  }
  if (values.some((item) => item.value === entity.value)) {
    return;
  }
  values.push(entity);
}

function literalReplaceAll(input: string, needle: string, replacement: string): string {
  if (!needle || input.length === 0 || !input.includes(needle)) {
    return input;
  }
  return input.split(needle).join(replacement);
}

function isHanChar(char: string): boolean {
  return /^[\u4e00-\u9fff]$/u.test(char);
}

function isUpperChar(char: string): boolean {
  return /^[A-Z]$/.test(char);
}

function isLowerChar(char: string): boolean {
  return /^[a-z]$/.test(char);
}

function isDigitChar(char: string): boolean {
  return /^\d$/.test(char);
}

function isWhitespaceChar(char: string): boolean {
  return /^\s$/.test(char);
}

function looksLikeStructuralTimestamp(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value);
}

function looksLikeScopedIdentifier(value: string): boolean {
  return /^(?:MSG_|EVT_|PER_|KB-|c[a-z0-9]{8,}|[A-Za-z0-9_-]{16,})/.test(value);
}

function deriveCharacter(digest: Buffer, index: number, original: string): string {
  const byte = digest[index % digest.length];
  if (isUpperChar(original)) {
    return asciiUpperAlphabet[byte % asciiUpperAlphabet.length];
  }
  if (isLowerChar(original)) {
    return asciiLowerAlphabet[byte % asciiLowerAlphabet.length];
  }
  if (isDigitChar(original)) {
    return digitAlphabet[byte % digitAlphabet.length];
  }
  if (isHanChar(original)) {
    return hanAlphabet[byte % hanAlphabet.length];
  }
  if (isWhitespaceChar(original)) {
    return original;
  }
  return original;
}

function deriveTokenCandidate(key: Buffer, original: string, salt: string): string {
  const digest = createHmac("sha256", key).update(`${salt}:${original}`).digest();
  return Array.from(original)
    .map((char, index) => deriveCharacter(digest, index, char))
    .join("");
}

function normalizeSeedEntity(value: MailPrivacyEntity | string | null | undefined): MailPrivacyEntity | null {
  if (!value) {
    return null;
  }
  if (typeof value === "string") {
    const normalized = normalizeEntityValue(value);
    if (!normalized || normalized.length < 2) {
      return null;
    }
    return { value: normalized, type: "generic" };
  }
  const normalized = normalizeEntityValue(value.value);
  if (!normalized || normalized.length < 2) {
    return null;
  }
  return {
    value: normalized,
    type: value.type,
  };
}

function detectFromPattern(
  text: string,
  pattern: RegExp,
  type: MailPrivacyEntityType,
  values: MailPrivacyEntity[],
  filter?: (candidate: string) => boolean
): void {
  for (const match of text.matchAll(pattern)) {
    const candidate = normalizeEntityValue(match[0] ?? "");
    if (!candidate || candidate.length < 2) {
      continue;
    }
    if (filter && !filter(candidate)) {
      continue;
    }
    uniquePush(values, { value: candidate, type });
  }
}

function inferEntityTypeFromKey(key: string): MailPrivacyEntityType | null {
  const lowered = key.toLowerCase();
  if (senderEmailFieldNames.has(lowered) || recipientEmailFieldNames.has(lowered)) {
    return null;
  }
  if (lowered.includes("email")) return "email";
  if (lowered.includes("domain")) return "domain";
  if (lowered.includes("sender") || lowered.includes("from") || lowered.includes("displayname")) {
    return "mailbox_name";
  }
  if (lowered.includes("company") || lowered.includes("org")) return "company";
  if (lowered.includes("product")) return "product";
  if (lowered.includes("address") || lowered.includes("location")) return "address";
  if (lowered.includes("phone")) return "phone";
  return null;
}

function emailFieldPlaceholderForPath(path: string[]): string | null {
  const key = (path[path.length - 1] ?? "").toLowerCase();
  const parent = (path[path.length - 2] ?? "").toLowerCase();
  const lowerPath = path.map((segment) => segment.toLowerCase());

  if (senderEmailFieldNames.has(key)) {
    return "[sender-email]";
  }
  if (recipientEmailFieldNames.has(key)) {
    return "[recipient-email]";
  }

  if (key === "address") {
    if (senderAddressPathSegments.has(parent)) {
      return "[sender-email]";
    }
    if (recipientAddressPathSegments.has(parent)) {
      return "[recipient-email]";
    }
    if (lowerPath.includes("emailaddress")) {
      if (lowerPath.some((segment) => senderAddressPathSegments.has(segment))) {
        return "[sender-email]";
      }
      if (lowerPath.some((segment) => recipientAddressPathSegments.has(segment))) {
        return "[recipient-email]";
      }
    }
  }

  return null;
}

function collectSeedEntitiesFromRecord(record: Record<string, unknown>): MailPrivacyEntity[] {
  const seeds: MailPrivacyEntity[] = [];
  for (const [key, rawValue] of Object.entries(record)) {
    if (typeof rawValue !== "string") {
      continue;
    }
    const normalized = normalizeEntityValue(rawValue);
    if (!normalized || normalized.length < 2) {
      continue;
    }
    const inferredType = inferEntityTypeFromKey(key);
    if (!inferredType) {
      continue;
    }
    uniquePush(seeds, { value: normalized, type: inferredType });
  }
  return seeds;
}

function shouldSkipMaskForPath(path: string[], value: string): boolean {
  const key = path[path.length - 1] ?? "";
  if (safeKeyNames.has(key)) {
    return true;
  }
  if (looksLikeStructuralTimestamp(value) || looksLikeScopedIdentifier(value)) {
    return true;
  }
  return false;
}

function restoreStructure(
  scope: MailPrivacyScope,
  value: unknown,
  path: string[],
  options: RestoreStructuredPayloadOptions
): unknown {
  if (typeof value === "string") {
    if (emailFieldPlaceholderForPath(path)) {
      return value;
    }
    if (shouldSkipMaskForPath(path, value)) {
      return value;
    }
    return scope.restoreText(value, options);
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => restoreStructure(scope, item, [...path, String(index)], options));
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  const next: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    next[key] = restoreStructure(scope, child, [...path, key], options);
  }
  return next;
}

function maskStructure(
  scope: MailPrivacyScope,
  value: unknown,
  path: string[],
  inheritedSeeds: MailPrivacyEntity[]
): unknown {
  if (typeof value === "string") {
    const emailPlaceholder = emailFieldPlaceholderForPath(path);
    if (emailPlaceholder) {
      return emailPlaceholder;
    }
    if (shouldSkipMaskForPath(path, value)) {
      return value;
    }
    return scope.pseudonymizeText(value, { seedEntities: inheritedSeeds });
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => maskStructure(scope, item, [...path, String(index)], inheritedSeeds));
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  const objectSeeds = collectSeedEntitiesFromRecord(value as Record<string, unknown>);
  const mergedSeeds = [...inheritedSeeds];
  for (const seed of objectSeeds) {
    uniquePush(mergedSeeds, seed);
  }

  const next: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    next[key] = maskStructure(scope, child, [...path, key], mergedSeeds);
  }
  return next;
}

export function isMailPrivacyError(error: unknown): error is MailPrivacyError {
  return error instanceof MailPrivacyError;
}

export function mailPrivacyReadiness(): {
  enabled: boolean;
  ready: boolean;
  code?: MailPrivacyErrorCode;
  error?: string;
} {
  if (!env.mailPrivacyEnabled) {
    return {
      enabled: false,
      ready: true,
    };
  }
  if (!env.mailPrivacyHmacKey) {
    return {
      enabled: true,
      ready: false,
      code: MAIL_PRIVACY_ERROR_CODES.NOT_READY,
      error: "MAIL_PRIVACY_HMAC_KEY is required for mail privacy",
    };
  }
  return {
    enabled: true,
    ready: true,
  };
}

function assertMailPrivacyReady(): void {
  const readiness = mailPrivacyReadiness();
  if (!readiness.ready) {
    throw new MailPrivacyError(
      readiness.code ?? MAIL_PRIVACY_ERROR_CODES.NOT_READY,
      readiness.error ?? "Mail privacy is not ready"
    );
  }
}

export class MailPrivacyScope {
  readonly kind: MailPrivacyScopeKind;
  readonly scopeId: string;
  readonly userId: string;
  readonly sourceId: string;
  readonly keyVersion: string;
  readonly createdAt: string;
  private readonly passthrough: boolean;
  private readonly hmacKey: Buffer;
  private updatedAt: string;
  private dirty = false;
  private readonly tokenByOriginal = new Map<string, string>();
  private readonly originalByToken = new Map<string, string>();
  private readonly entityTypeByOriginal = new Map<string, MailPrivacyEntityType>();

  constructor(input: CreateMailPrivacyScopeInput) {
    this.passthrough = !env.mailPrivacyEnabled;
    if (!this.passthrough) {
      assertMailPrivacyReady();
    }

    this.kind = input.kind;
    this.scopeId = input.scopeId;
    this.userId = input.userId;
    this.sourceId = input.sourceId;
    this.keyVersion = env.mailPrivacyKeyVersion;
    this.hmacKey = this.passthrough ? Buffer.alloc(0) : Buffer.from(env.mailPrivacyHmacKey, "utf8");

    if (input.snapshot) {
      this.createdAt = input.snapshot.createdAt;
      this.updatedAt = input.snapshot.updatedAt;
      for (const mapping of input.snapshot.mappings) {
        this.tokenByOriginal.set(mapping.original, mapping.token);
        this.originalByToken.set(mapping.token, mapping.original);
        this.entityTypeByOriginal.set(mapping.original, mapping.type);
      }
      return;
    }

    const now = new Date().toISOString();
    this.createdAt = now;
    this.updatedAt = now;
  }

  snapshot(): MailPrivacyScopeSnapshot {
    return {
      version: 1,
      kind: this.kind,
      scopeId: this.scopeId,
      userId: this.userId,
      sourceId: this.sourceId,
      keyVersion: this.keyVersion,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      mappings: Array.from(this.tokenByOriginal.entries()).map(([original, token]) => ({
        original,
        token,
        type: this.entityTypeByOriginal.get(original) ?? "generic",
      })),
    };
  }

  isDirty(): boolean {
    return this.dirty;
  }

  maxTokenLength(): number {
    if (this.passthrough) {
      return 0;
    }
    let maxLength = 0;
    for (const token of this.originalByToken.keys()) {
      if (token.length > maxLength) {
        maxLength = token.length;
      }
    }
    return maxLength;
  }

  tokenValues(): string[] {
    return Array.from(this.originalByToken.keys());
  }

  stripMailAddresses(input: string): string {
    if (!input || this.passthrough) {
      return input;
    }
    return input.replace(emailPattern, "[email]");
  }

  detectEntities(input: string, options?: PseudonymizeOptions): MailPrivacyEntity[] {
    if (this.passthrough) {
      return [];
    }
    const text = this.stripMailAddresses(input);
    const entities: MailPrivacyEntity[] = [];
    const seeds = options?.seedEntities ?? [];
    for (const seed of seeds) {
      const normalized = normalizeSeedEntity(seed);
      if (!normalized || !text.includes(normalized.value)) {
        continue;
      }
      uniquePush(entities, normalized);
    }

    detectFromPattern(text, emailPattern, "email", entities);
    detectFromPattern(text, urlPattern, "url", entities);
    detectFromPattern(text, domainPattern, "domain", entities);
    detectFromPattern(text, phonePattern, "phone", entities, isLikelyPhoneCandidate);
    detectKnownLocations(text, entities);
    detectEnglishCompanies(text, entities);
    detectFromPattern(text, chineseCompanyPattern, "company", entities);
    detectFromPattern(text, chineseAddressPattern, "address", entities, (candidate) => candidate.length >= 4);
    detectFromPattern(text, englishAddressPattern, "address", entities);
    detectFromPattern(text, chinesePersonPattern, "person", entities, (candidate) => candidate.length >= 2);
    detectEnglishPeople(text, entities);
    detectFromPattern(text, productPattern, "product", entities, (candidate) => {
      return candidate.length >= 4 && isLikelyProductCandidate(candidate);
    });
    detectFromPattern(text, longNumberPattern, "identifier", entities);
    detectFromPattern(text, mixedIdentifierPattern, "identifier", entities, (candidate) => {
      return !isIsoDateCandidate(candidate) && (/[A-Z]/.test(candidate) || /\d/.test(candidate));
    });

    return entities.sort((left, right) => right.value.length - left.value.length);
  }

  pseudonymizeText(input: string, options?: PseudonymizeOptions): string {
    if (this.passthrough) {
      return input;
    }
    try {
      let masked = this.stripMailAddresses(input);
      const entities = this.detectEntities(masked, options);
      for (const entity of entities) {
        const token = this.ensureToken(entity.value, entity.type);
        masked = literalReplaceAll(masked, entity.value, token);
      }
      return masked;
    } catch (error) {
      throw new MailPrivacyError(
        MAIL_PRIVACY_ERROR_CODES.MASK_FAILED,
        error instanceof Error ? error.message : "Failed to pseudonymize text"
      );
    }
  }

  maskStructuredPayload(payload: unknown, options?: StructuredPayloadOptions): unknown {
    if (this.passthrough) {
      return payload;
    }
    try {
      const seeds: MailPrivacyEntity[] = [];
      for (const seed of options?.seedEntities ?? []) {
        const normalized = normalizeSeedEntity(seed);
        if (normalized) {
          uniquePush(seeds, normalized);
        }
      }
      return maskStructure(this, payload, [], seeds);
    } catch (error) {
      throw new MailPrivacyError(
        MAIL_PRIVACY_ERROR_CODES.MASK_FAILED,
        error instanceof Error ? error.message : "Failed to mask structured payload"
      );
    }
  }

  restoreText(input: string, options?: { allowUnknownTokens?: boolean }): string {
    if (this.passthrough) {
      return input;
    }
    try {
      let restored = input;
      const entries = Array.from(this.originalByToken.entries()).sort(
        (left, right) => right[0].length - left[0].length
      );
      for (const [token, original] of entries) {
        restored = literalReplaceAll(restored, token, original);
      }
      if (!options?.allowUnknownTokens) {
        for (const token of this.originalByToken.keys()) {
          if (restored.includes(token)) {
            throw new Error(`Unresolved privacy token remains in output: ${token}`);
          }
        }
      }
      return restored;
    } catch (error) {
      throw new MailPrivacyError(
        MAIL_PRIVACY_ERROR_CODES.RESTORE_FAILED,
        error instanceof Error ? error.message : "Failed to restore masked text"
      );
    }
  }

  restoreStructuredPayload(payload: unknown, options?: RestoreStructuredPayloadOptions): unknown {
    if (this.passthrough) {
      return payload;
    }
    try {
      return restoreStructure(this, payload, [], options ?? {});
    } catch (error) {
      throw new MailPrivacyError(
        MAIL_PRIVACY_ERROR_CODES.RESTORE_FAILED,
        error instanceof Error ? error.message : "Failed to restore structured payload"
      );
    }
  }

  private ensureToken(originalValue: string, type: MailPrivacyEntityType): string {
    const normalized = normalizeEntityValue(originalValue);
    if (!normalized || normalized.length < 2) {
      return normalized;
    }

    const existing = this.tokenByOriginal.get(normalized);
    if (existing) {
      return existing;
    }

    let candidate = normalized;
    let attempt = 0;
    while (attempt < 8) {
      candidate = deriveTokenCandidate(
        this.hmacKey,
        normalized,
        `${this.keyVersion}:${this.scopeId}:${type}:${attempt}`
      );
      const owner = this.originalByToken.get(candidate);
      if (!owner || owner === normalized) {
        break;
      }
      attempt += 1;
    }

    this.tokenByOriginal.set(normalized, candidate);
    this.originalByToken.set(candidate, normalized);
    this.entityTypeByOriginal.set(normalized, type);
    this.updatedAt = new Date().toISOString();
    this.dirty = true;
    return candidate;
  }
}

export class PrivacyStreamRestorer {
  private pending = "";

  constructor(private readonly scope: MailPrivacyScope) {}

  private trailingTokenPrefixLength(input: string): number {
    let longest = 0;
    for (const token of this.scope.tokenValues()) {
      const maxCandidate = Math.min(token.length - 1, input.length);
      for (let length = maxCandidate; length > longest; length -= 1) {
        if (token.startsWith(input.slice(-length))) {
          longest = length;
          break;
        }
      }
    }
    return longest;
  }

  push(maskedDelta: string): string {
    if (!maskedDelta) {
      return "";
    }

    this.pending += maskedDelta;
    const guardLength = this.trailingTokenPrefixLength(this.pending);
    if (guardLength === 0) {
      const restored = this.scope.restoreText(this.pending, { allowUnknownTokens: true });
      this.pending = "";
      return restored;
    }
    if (this.pending.length <= guardLength) {
      return "";
    }

    const safeLength = this.pending.length - guardLength;
    const safeText = this.pending.slice(0, safeLength);
    this.pending = this.pending.slice(safeLength);
    return this.scope.restoreText(safeText, { allowUnknownTokens: true });
  }

  flush(): string {
    if (!this.pending) {
      return "";
    }
    const remaining = this.pending;
    this.pending = "";
    return this.scope.restoreText(remaining);
  }
}

export function createPrivacyStreamRestorer(scope: MailPrivacyScope): PrivacyStreamRestorer {
  return new PrivacyStreamRestorer(scope);
}

export function createPrivacyScope(input: CreateMailPrivacyScopeInput): MailPrivacyScope {
  return new MailPrivacyScope(input);
}
