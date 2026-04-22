#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const tracked = spawnSync("git", ["ls-files", "-z"], {
  encoding: "utf8",
  shell: false,
});

if ((tracked.status ?? 1) !== 0) {
  console.error("REPO_BOUNDARY_DENY unable to inspect tracked files with git ls-files");
  process.exit(tracked.status ?? 1);
}

const blockedRules = [
  {
    id: "macos-metadata",
    test: (file) => file === ".DS_Store" || file.endsWith("/.DS_Store"),
  },
  {
    id: "typescript-build-cache",
    test: (file) => file.endsWith(".tsbuildinfo"),
  },
  {
    id: "web-build-output",
    test: (file) => /^apps\/[^/]+\/dist\//.test(file),
  },
  {
    id: "coverage-output",
    test: (file) => file === "coverage" || file.startsWith("coverage/") || /^apps\/[^/]+\/coverage\//.test(file),
  },
  {
    id: "playwright-artifact",
    test: (file) => /^apps\/[^/]+\/(?:playwright-report|test-results)\//.test(file),
  },
  {
    id: "bff-runtime-data",
    test: (file) => file.startsWith("apps/bff/data/"),
  },
  {
    id: "legacy-flat-mail-kb",
    test: (file) => file.startsWith("mail-kb/"),
  },
  {
    id: "imported-reference-webui",
    test: (file) => /^reference\/remote-webui-[^/]+\//.test(file),
  },
  {
    id: "retired-login-prototype",
    test: (file) => file.startsWith("website-login-main/"),
  },
];

const violations = tracked.stdout
  .split("\0")
  .filter(Boolean)
  .flatMap((file) =>
    blockedRules
      .filter((rule) => rule.test(file))
      .map((rule) => ({ file, rule: rule.id }))
  );

if (violations.length > 0) {
  console.error("REPO_BOUNDARY_DENY tracked generated/runtime/legacy files found:");
  for (const { file, rule } of violations) {
    console.error(`- ${file} (${rule})`);
  }
  process.exit(1);
}

console.log("REPO_BOUNDARY_OK");
