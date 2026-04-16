#!/usr/bin/env node

import { getChangedFiles, hasNodeModules, runCommand } from "./harness-lib.mjs";

const files = getChangedFiles(process.argv.slice(2));
const joined = files.join(" ");

console.log(`HARNESS_VERIFY files=${files.length}`);

let status = runCommand("node", ["scripts/harness-validate-mcp.mjs"]).status ?? 1;
if (status !== 0) {
  process.exit(status);
}

status = runCommand("node", ["scripts/harness-semantic-check.mjs", ...files]).status ?? 1;
if (status !== 0) {
  process.exit(status);
}

const needsTypecheck = files.some((file) => /\.(ts|tsx)$/.test(file));
const needsE2eSmoke = files.some((file) => file.startsWith("apps/webui/e2e/") || file.endsWith("playwright.config.ts"));

if ((needsTypecheck || needsE2eSmoke) && !hasNodeModules()) {
  console.error("HARNESS_VERIFY_DENY node_modules is missing. Run npm install before type/e2e verification.");
  process.exit(1);
}

if (needsTypecheck) {
  status = runCommand("npm", ["run", "check", "--workspaces", "--if-present"]).status ?? 1;
  if (status !== 0) {
    process.exit(status);
  }
}

if (needsE2eSmoke) {
  status = runCommand("npm", ["--workspace", "apps/webui", "run", "test:e2e", "--", "e2e/smoke.spec.ts"]).status ?? 1;
  if (status !== 0) {
    process.exit(status);
  }
}

console.log(`HARNESS_VERIFY_OK changed="${joined}"`);
