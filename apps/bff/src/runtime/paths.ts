import { fileURLToPath } from "node:url";
import { isAbsolute, resolve } from "node:path";
import { env } from "../config.js";

const bffRoot = fileURLToPath(new URL("../../", import.meta.url));
const repoRoot = resolve(bffRoot, "..", "..");

function resolveOverride(baseDir: string, override: string): string {
  if (!override) {
    return baseDir;
  }

  return isAbsolute(override) ? override : resolve(baseDir, override);
}

export const runtimePaths = {
  bffRoot,
  repoRoot,
  skillsDir: resolveOverride(repoRoot, env.agentSkillsDir || "skills"),
  dataDir: resolveOverride(bffRoot, env.agentDataDir || "data"),
};
