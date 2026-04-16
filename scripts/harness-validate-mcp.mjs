#!/usr/bin/env node

import fs from "node:fs";
import { readJson, resolveRoot } from "./harness-lib.mjs";

const activeFiles = [".cursor/mcp.json", ".cursor/mcp-servers.json"];
const optionalFiles = [".cursor/mcp.optional.json"];
const errors = [];
const warnings = [];

function readMcp(relativePath) {
  const filePath = resolveRoot(relativePath);
  if (!fs.existsSync(filePath)) {
    warnings.push(`${relativePath} is missing`);
    return null;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!parsed.mcpServers || typeof parsed.mcpServers !== "object") {
      errors.push(`${relativePath} must contain an mcpServers object`);
      return null;
    }
    return parsed;
  } catch (error) {
    errors.push(`${relativePath} is invalid JSON: ${error.message}`);
    return null;
  }
}

const activeConfigs = activeFiles.map((file) => [file, readMcp(file)]).filter(([, config]) => config);
for (const file of optionalFiles) {
  readMcp(file);
}

for (const [file, config] of activeConfigs) {
  for (const [name, server] of Object.entries(config.mcpServers)) {
    const args = Array.isArray(server.args) ? server.args.join(" ") : "";
    if (args.includes("openclaw-mcp-gateway")) {
      errors.push(`${file}:${name} uses openclaw-mcp-gateway, which is not published on npm`);
    }
    if (args.includes("${")) {
      errors.push(`${file}:${name} has unresolved placeholder env in active args`);
    }
  }
}

const main = activeConfigs.find(([file]) => file === ".cursor/mcp.json")?.[1];
if (main) {
  const names = Object.keys(main.mcpServers);
  for (const expected of ["filesystem", "playwright"]) {
    if (!names.includes(expected)) {
      errors.push(`.cursor/mcp.json is missing active ${expected} MCP server`);
    }
  }
}

const catalog = readJson(".harness/mcp.catalog.json");
const activeNames = new Set(catalog.active.map((item) => item.name));
for (const expected of ["filesystem", "playwright"]) {
  if (!activeNames.has(expected)) {
    errors.push(`.harness/mcp.catalog.json is missing active catalog entry for ${expected}`);
  }
}

for (const warning of warnings) {
  console.warn(`HARNESS_MCP_WARN ${warning}`);
}

if (errors.length > 0) {
  console.error("HARNESS_MCP_DENY");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("HARNESS_MCP_OK");

