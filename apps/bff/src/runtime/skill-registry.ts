import { readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { runtimePaths } from "./paths.js";

type JsonRecord = Record<string, unknown>;

export type SkillSummary = {
  id: string;
  slug: string;
  name: string;
  description: string;
  tags: string[];
  version: string | null;
  path: string;
  promptSnippet: string;
};

function normalizeWhitespace(input: string): string {
  return input.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
}

function stripMarkdown(input: string): string {
  return normalizeWhitespace(
    input
      .replace(/^---[\s\S]*?---\s*/m, "")
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/```[\s\S]*?```/g, "")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
      .replace(/[*_>-]/g, " ")
  );
}

function parseFrontMatter(input: string): Record<string, string> {
  const match = input.match(/^---\n([\s\S]*?)\n---/);
  if (!match) {
    return {};
  }

  const result: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const index = line.indexOf(":");
    if (index <= 0) {
      continue;
    }
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim().replace(/^["']|["']$/g, "");
    if (key && value) {
      result[key] = value;
    }
  }
  return result;
}

async function readOptionalJson(path: string): Promise<JsonRecord | null> {
  try {
    const text = await readFile(path, "utf8");
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as JsonRecord;
  } catch {
    return null;
  }
}

function toTags(raw: unknown[]): string[] {
  return raw
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim());
}

function queryLooksMailRelated(query: string): boolean {
  return /mail|email|outlook|inbox|calendar|meeting|ddl|deadline|邮件|邮箱|会议|日历|考试|作业/i.test(query);
}

function queryTokens(query: string): string[] {
  return Array.from(
    new Set(
      query
        .toLowerCase()
        .split(/[^a-z0-9\u4e00-\u9fff]+/i)
        .map((item) => item.trim())
        .filter((item) => item.length >= 2)
    )
  );
}

export class SkillRegistry {
  private cache: SkillSummary[] | null = null;
  private cacheLoadedAt = 0;
  private readonly cacheTtlMs = 10000;

  async list(): Promise<SkillSummary[]> {
    if (this.cache && Date.now() - this.cacheLoadedAt < this.cacheTtlMs) {
      return this.cache;
    }

    const skillsDir = runtimePaths.skillsDir;
    const dirents = await readdir(skillsDir, { withFileTypes: true });
    const skills: SkillSummary[] = [];

    for (const dirent of dirents) {
      if (!dirent.isDirectory() || dirent.name.startsWith(".")) {
        continue;
      }

      const baseDir = join(skillsDir, dirent.name);
      const markdownPath = join(baseDir, "SKILL.md");

      let markdown = "";
      try {
        markdown = await readFile(markdownPath, "utf8");
      } catch {
        continue;
      }

      const frontMatter = parseFrontMatter(markdown);
      const skillJson = await readOptionalJson(join(baseDir, "skill.json"));
      const metaJson = await readOptionalJson(join(baseDir, "_meta.json"));
      const stripped = stripMarkdown(markdown);

      const name =
        frontMatter.name ||
        (typeof skillJson?.name === "string" ? skillJson.name : "") ||
        basename(baseDir);
      const description =
        frontMatter.description ||
        (typeof skillJson?.description === "string" ? skillJson.description : "") ||
        stripped.slice(0, 180);
      const tags = toTags(Array.isArray(skillJson?.keywords) ? skillJson.keywords : []);
      const version =
        typeof skillJson?.version === "string"
          ? skillJson.version
          : typeof metaJson?.version === "string"
            ? metaJson.version
            : null;

      skills.push({
        id: dirent.name,
        slug: dirent.name,
        name,
        description,
        tags,
        version,
        path: baseDir,
        promptSnippet: stripped.slice(0, 1400),
      });
    }

    this.cache = skills.sort((left, right) => left.slug.localeCompare(right.slug));
    this.cacheLoadedAt = Date.now();
    return this.cache;
  }

  async refresh(): Promise<SkillSummary[]> {
    this.cache = null;
    this.cacheLoadedAt = 0;
    return this.list();
  }

  async getByIds(ids: string[]): Promise<SkillSummary[]> {
    const normalized = new Set(ids.map((item) => item.trim()).filter(Boolean));
    const all = await this.list();
    return all.filter((item) => normalized.has(item.id) || normalized.has(item.slug));
  }

  async findRelevant(query: string, limit = 4): Promise<SkillSummary[]> {
    const all = await this.list();
    const tokens = queryTokens(query);
    const mailRelated = queryLooksMailRelated(query);

    const scored = all
      .map((skill) => {
        const haystack = `${skill.slug} ${skill.name} ${skill.description} ${skill.tags.join(" ")} ${skill.promptSnippet}`
          .toLowerCase();
        let score = 0;

        for (const token of tokens) {
          if (haystack.includes(token)) {
            score += token.length >= 4 ? 3 : 1;
          }
        }

        if (mailRelated && /mail|email|imap|outlook|knowledge|summary|weather/i.test(haystack)) {
          score += 2;
        }

        if (skill.slug.includes("mail") && mailRelated) {
          score += 2;
        }

        return { skill, score };
      })
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score || left.skill.slug.localeCompare(right.skill.slug))
      .slice(0, limit)
      .map((item) => item.skill);

    if (scored.length > 0) {
      return scored;
    }

    return all
      .filter((skill) => /mail|email|outlook|knowledge/i.test(`${skill.slug} ${skill.description}`))
      .slice(0, Math.min(limit, 3));
  }
}

export function createSkillRegistry(): SkillRegistry {
  return new SkillRegistry();
}
