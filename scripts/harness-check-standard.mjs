#!/usr/bin/env node

import { hasNodeModules, runCommand } from "./harness-lib.mjs";

const steps = [
  ["node", ["scripts/check-repo-boundary.mjs"]],
  ["node", ["scripts/harness-validate-mcp.mjs"]],
  ["npm", ["run", "check:tenant"]],
  ["npm", ["run", "check:audit"]],
  ["npm", ["run", "check:state"]],
  ["npm", ["run", "check:rls"]],
  ["npm", ["run", "check:storage"]],
  ["npm", ["run", "check:contracts"]],
  ["npm", ["run", "check:correction"]],
  ["npm", ["run", "check:invariants"]],
];

for (const [command, args] of steps) {
  const result = runCommand(command, args);
  if ((result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (!hasNodeModules()) {
  console.error("HARNESS_STANDARD_DENY node_modules is missing. Run npm install before standard verification.");
  process.exit(1);
}

for (const args of [
  ["run", "check", "--workspaces", "--if-present"],
  ["--workspace", "apps/webui", "run", "test:e2e", "--", "e2e/smoke.spec.ts"],
]) {
  const result = runCommand("npm", args);
  if ((result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log("HARNESS_STANDARD_OK");
