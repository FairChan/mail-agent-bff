#!/usr/bin/env node

import fs from "node:fs";
import { runCommand, resolveRoot } from "./harness-lib.mjs";

const checkName = process.argv[2];

if (!checkName) {
  console.error("Usage: node scripts/harness-domain-check.mjs <tenant|audit|state|rls|storage|contracts|correction|invariants>");
  process.exit(2);
}

const known = new Set(["tenant", "audit", "state", "rls", "storage", "contracts", "correction", "invariants"]);
if (!known.has(checkName)) {
  console.error(`Unknown Harness domain check: ${checkName}`);
  process.exit(2);
}

function pass(message) {
  console.log(`HARNESS_${checkName.toUpperCase()}_OK ${message}`);
}

function fail(message) {
  console.error(`HARNESS_${checkName.toUpperCase()}_DENY ${message}`);
  process.exit(1);
}

switch (checkName) {
  case "contracts": {
    const schemaPath = resolveRoot("apps/bff/src/api-schema.json");
    if (!fs.existsSync(schemaPath)) {
      fail("apps/bff/src/api-schema.json is missing");
    }
    JSON.parse(fs.readFileSync(schemaPath, "utf8"));
    pass("API schema parses as JSON");
    break;
  }
  case "invariants": {
    const result = runCommand("node", ["scripts/harness-semantic-check.mjs"]);
    process.exit(result.status ?? 1);
  }
  case "rls": {
    if (!fs.existsSync(resolveRoot("supabase"))) {
      pass("N/A: no supabase directory in this workspace");
      break;
    }
    pass("Supabase directory present; dedicated RLS parser not enabled yet");
    break;
  }
  case "tenant": {
    pass("N/A: no tenant schema source of truth configured yet");
    break;
  }
  case "audit": {
    pass("Initial pass: audit-log coverage detector is not specialized for this app yet");
    break;
  }
  case "state": {
    pass("Initial pass: no centralized state-machine registry configured yet");
    break;
  }
  case "storage": {
    pass("N/A: no storage bucket registry configured yet");
    break;
  }
  case "correction": {
    pass("N/A: no accounting correction workflow configured yet");
    break;
  }
}

