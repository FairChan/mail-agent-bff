#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

export const rootDir = path.resolve(new URL("..", import.meta.url).pathname);

export function resolveRoot(...parts) {
  return path.join(rootDir, ...parts);
}

export function readJson(relativePath) {
  const filePath = resolveRoot(relativePath);
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function fileExists(relativePath) {
  return fs.existsSync(resolveRoot(relativePath));
}

export function localIsoTimestamp(date = new Date()) {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMinutes);
  const hours = String(Math.floor(abs / 60)).padStart(2, "0");
  const minutes = String(abs % 60).padStart(2, "0");
  const local = new Date(date.getTime() + offsetMinutes * 60_000)
    .toISOString()
    .replace(/\.\d{3}Z$/, "");
  return `${local}${sign}${hours}:${minutes}`;
}

export function appendJournal({ trigger, rootCause, cosmeticFixRejection, realFix, candidatePattern }) {
  const journalPath = resolveRoot(".harness", "error-journal.md");
  const entry = [
    "",
    `## ${localIsoTimestamp()}`,
    "",
    `- Trigger: ${trigger}`,
    `- ROOT CAUSE: ${rootCause}`,
    `- COSMETIC FIX REJECTION: ${cosmeticFixRejection}`,
    `- REAL FIX: ${realFix}`,
    `- Candidate pattern: ${candidatePattern}`,
    "",
  ].join("\n");
  fs.appendFileSync(journalPath, entry, "utf8");
}

export function runCommand(command, args = [], options = {}) {
  return spawnSync(command, args, {
    cwd: rootDir,
    stdio: "inherit",
    shell: false,
    ...options,
  });
}

export function captureCommand(command, args = []) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    encoding: "utf8",
    shell: false,
  });
  if (result.status !== 0) {
    return "";
  }
  return result.stdout.trim();
}

export function getChangedFiles(explicitFiles = []) {
  const cleaned = explicitFiles
    .flatMap((item) => String(item).split(/\s+/))
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => path.relative(rootDir, path.resolve(rootDir, item)));

  if (cleaned.length > 0) {
    return [...new Set(cleaned)].filter((file) => fs.existsSync(resolveRoot(file)));
  }

  const diff = captureCommand("git", ["diff", "--name-only", "--diff-filter=ACMRTUXB", "HEAD"]);
  const untracked = captureCommand("git", ["ls-files", "--others", "--exclude-standard"]);
  const files = `${diff}\n${untracked}`
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
  return [...new Set(files)].filter((file) => fs.existsSync(resolveRoot(file)));
}

export function getTrackedAndUntrackedFiles() {
  const tracked = captureCommand("git", ["ls-files"]);
  const untracked = captureCommand("git", ["ls-files", "--others", "--exclude-standard"]);
  return [...new Set(`${tracked}\n${untracked}`.split(/\r?\n/).filter(Boolean))];
}

export function isSourceFile(file) {
  return /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(file) && !isIgnoredPath(file);
}

export function isIgnoredPath(file) {
  return (
    file.includes("node_modules/") ||
    file.includes("/dist/") ||
    file.includes("/.vite/") ||
    file.startsWith(".harness/tmp/")
  );
}

export function matchesAnyGlob(file, globs = []) {
  if (!globs || globs.length === 0) {
    return true;
  }
  return globs.some((glob) => globToRegExp(glob).test(file));
}

function globToRegExp(glob) {
  let pattern = "";
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index];
    const next = glob[index + 1];
    const afterNext = glob[index + 2];
    if (char === "*" && next === "*" && afterNext === "/") {
      pattern += "(?:.*\\/)?";
      index += 2;
      continue;
    }
    if (char === "*" && next === "*") {
      pattern += ".*";
      index += 1;
      continue;
    }
    if (char === "*") {
      pattern += "[^/]*";
      continue;
    }
    if (char === "?") {
      pattern += ".";
      continue;
    }
    pattern += char.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${pattern}$`);
}

export function makeRegExp(rule) {
  const flags = rule.flags ?? "";
  return new RegExp(rule.regex, flags);
}

export function hasNodeModules() {
  return fs.existsSync(resolveRoot("node_modules", ".bin", "tsc"));
}
