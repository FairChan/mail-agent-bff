#!/usr/bin/env node

import { appendJournal } from "./harness-lib.mjs";

const [tool = "unknown-tool", exitCode = "unknown-exit", ...rest] = process.argv.slice(2);
const context = rest.join(" ").trim() || "No extra context supplied.";

const template = {
  trigger: `${tool} exited with ${exitCode}: ${context}`,
  rootCause: "Explain what risk the failed check or tool was preventing before changing code.",
  cosmeticFixRejection: "Reject changes that merely silence the checker without removing the risk.",
  realFix: "Make the smallest change that removes the underlying risk, then rerun validation.",
  candidatePattern: "Add or update a pattern only if this failure is likely to recur.",
};

appendJournal(template);

console.log("HARNESS_FAILURE_RECOVERY");
console.log(`ROOT CAUSE: ${template.rootCause}`);
console.log(`COSMETIC FIX REJECTION: ${template.cosmeticFixRejection}`);
console.log(`REAL FIX: ${template.realFix}`);
console.log("Recorded in .harness/error-journal.md");

