#!/usr/bin/env node

import { appendJournal, makeRegExp, readJson } from "./harness-lib.mjs";

const command = process.argv.slice(2).join(" ").trim();

if (!command) {
  console.error("Usage: npm run harness:guard -- <command>");
  process.exit(2);
}

const patterns = readJson(".harness/patterns-cache.json");
const commandRules = patterns.rules.filter((rule) => rule.scope === "command");
const denials = [];
const warnings = [];

for (const rule of commandRules) {
  if (rule.allowTag && command.includes(rule.allowTag)) {
    continue;
  }
  const regex = makeRegExp(rule);
  if (!regex.test(command)) {
    continue;
  }
  const item = `${rule.id}: ${rule.message}`;
  if (rule.severity === "error") {
    denials.push(item);
  } else {
    warnings.push(item);
  }
}

for (const warning of warnings) {
  console.warn(`HARNESS_WARN ${warning}`);
}

if (denials.length > 0) {
  console.error("HARNESS_DENY dangerous command blocked:");
  for (const denial of denials) {
    console.error(`- ${denial}`);
  }
  appendJournal({
    trigger: `dangerous-cmd-guard: ${command}`,
    rootCause: "A command matched a Harness deny rule for destructive local or external side effects.",
    cosmeticFixRejection: "Do not bypass the guard by changing syntax while keeping the same destructive action.",
    realFix: "Use a recoverable, scoped, or explicitly approved operation.",
    candidatePattern: denials.map((item) => item.split(":")[0]).join(", "),
  });
  process.exit(2);
}

console.log("HARNESS_GUARD_OK");

