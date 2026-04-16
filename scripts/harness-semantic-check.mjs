#!/usr/bin/env node

import fs from "node:fs";
import {
  getChangedFiles,
  getTrackedAndUntrackedFiles,
  isSourceFile,
  makeRegExp,
  matchesAnyGlob,
  readJson,
  resolveRoot,
} from "./harness-lib.mjs";

const explicit = process.argv.slice(2);
const files = explicit.length > 0 ? getChangedFiles(explicit) : getTrackedAndUntrackedFiles();
const sourceFiles = files.filter(isSourceFile);
const patterns = readJson(".harness/patterns-cache.json");
const sourceRules = patterns.rules.filter((rule) => rule.scope === "source");
const errors = [];
const warnings = [];

for (const file of sourceFiles) {
  const fullPath = resolveRoot(file);
  const stat = fs.statSync(fullPath);
  if (stat.size > 1_000_000) {
    continue;
  }
  const lines = fs.readFileSync(fullPath, "utf8").split(/\r?\n/);
  for (const rule of sourceRules) {
    if (!matchesAnyGlob(file, rule.fileGlobs)) {
      continue;
    }
    const regex = makeRegExp(rule);
    const antiRegex = rule.antiRegex ? new RegExp(rule.antiRegex, rule.flags ?? "") : null;
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (rule.allowTag && line.includes(rule.allowTag)) {
        continue;
      }
      if (!regex.test(line)) {
        continue;
      }
      if (antiRegex && antiRegex.test(line)) {
        continue;
      }
      const message = `${file}:${index + 1} ${rule.id}: ${rule.message}`;
      if (rule.severity === "error") {
        errors.push(message);
      } else {
        warnings.push(message);
      }
    }
  }
}

for (const warning of warnings) {
  console.warn(`HARNESS_WARN ${warning}`);
}

if (errors.length > 0) {
  console.error("HARNESS_SEMANTIC_DENY");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`HARNESS_SEMANTIC_OK checked=${sourceFiles.length} warnings=${warnings.length}`);

