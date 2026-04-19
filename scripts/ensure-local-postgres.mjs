#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const envFile = process.argv[2]
  ? path.resolve(process.cwd(), process.argv[2])
  : path.join(rootDir, "apps/bff/.env");
const postgresFormula = process.env.POSTGRES_FORMULA?.trim() || "postgresql@15";

function fail(message) {
  console.error(message);
  process.exit(1);
}

function readDotEnv(filePath) {
  if (!existsSync(filePath)) {
    fail(`Env file not found: ${filePath}`);
  }

  const values = {};
  for (const rawLine of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const separatorIndex = line.indexOf("=");
    if (separatorIndex < 1) {
      continue;
    }
    const rawKey = line.slice(0, separatorIndex).trim();
    const key = rawKey.startsWith("export ") ? rawKey.slice("export ".length).trim() : rawKey;
    let value = line.slice(separatorIndex + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, "").trim();
    }
    values[key] = value;
  }
  return values;
}

function safeDecodeURIComponent(value, label) {
  try {
    return decodeURIComponent(value);
  } catch (error) {
    fail(`DATABASE_URL contains invalid percent-encoding in ${label}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function parseDatabaseUrl(databaseUrl) {
  if (!databaseUrl || !databaseUrl.trim()) {
    fail(`DATABASE_URL is missing in ${envFile}`);
  }

  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch (error) {
    fail(`DATABASE_URL is invalid: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!/^postgres(ql)?:$/i.test(parsed.protocol)) {
    fail("DATABASE_URL must use the postgres or postgresql scheme.");
  }

  return {
    host: parsed.hostname || "127.0.0.1",
    port: parsed.port ? Number(parsed.port) : 5432,
    database: safeDecodeURIComponent(parsed.pathname.replace(/^\//, ""), "database"),
    username: safeDecodeURIComponent(parsed.username, "username"),
    password: safeDecodeURIComponent(parsed.password, "password"),
  };
}

function quoteLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function quoteIdent(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });

  if (result.error) {
    fail(`Failed to run ${command}: ${result.error.message}`);
  }

  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || "").trim();
    fail(`Command failed: ${command} ${args.join(" ")}${detail ? `\n${detail}` : ""}`);
  }

  return (result.stdout || "").trim();
}

function tryRun(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });
}

function ensureLocalAddress(host) {
  const normalized = host.trim().toLowerCase();
  const allowed = new Set(["127.0.0.1", "localhost", "::1"]);
  if (!allowed.has(normalized)) {
    fail(`db:ensure-local only supports localhost addresses, got ${host}`);
  }
}

async function waitForReady(pgIsReadyPath, dbInfo) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const result = tryRun(pgIsReadyPath, [
      "-h",
      dbInfo.host,
      "-p",
      String(dbInfo.port),
      "-d",
      "postgres",
    ]);
    if (result.status === 0) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  fail(`PostgreSQL did not become ready on ${dbInfo.host}:${dbInfo.port} within 90 seconds.`);
}

async function ensureUnixPostgres(dbInfo) {
  ensureLocalAddress(dbInfo.host);

  let binDir = "";
  if (os.platform() === "darwin") {
    const prefix = run("brew", ["--prefix", postgresFormula]);
    binDir = path.join(prefix, "bin");
    if (!existsSync(path.join(binDir, "psql"))) {
      fail(`Homebrew formula ${postgresFormula} is not installed. Run: brew install ${postgresFormula}`);
    }
  }

  const psql = binDir ? path.join(binDir, "psql") : "psql";
  const pgIsReady = binDir ? path.join(binDir, "pg_isready") : "pg_isready";

  const readyCheck = tryRun(pgIsReady, [
    "-h",
    dbInfo.host,
    "-p",
    String(dbInfo.port),
    "-d",
    "postgres",
  ]);

  if (readyCheck.status !== 0) {
    if (os.platform() === "darwin") {
      console.log(`Starting ${postgresFormula} with Homebrew services...`);
      run("brew", ["services", "start", postgresFormula]);
      await waitForReady(pgIsReady, dbInfo);
    } else {
      fail(
        `PostgreSQL is not listening on ${dbInfo.host}:${dbInfo.port}. Start your local PostgreSQL service manually, then rerun db:ensure-local.`,
      );
    }
  }

  let adminBaseArgs = ["-h", dbInfo.host, "-p", String(dbInfo.port), "-d", "postgres"];
  let adminProbe = tryRun(psql, [...adminBaseArgs, "-Atqc", "SELECT current_setting('port')"]);
  if (adminProbe.status !== 0) {
    adminBaseArgs = ["-p", String(dbInfo.port), "-d", "postgres"];
    adminProbe = tryRun(psql, [...adminBaseArgs, "-Atqc", "SELECT current_setting('port')"]);
  }
  if (adminProbe.status !== 0) {
    const detail = (adminProbe.stderr || adminProbe.stdout || "").trim();
    fail(
      `Connected server is up, but local admin access failed. Ensure your local Postgres cluster has a superuser for ${os.userInfo().username}.${detail ? `\n${detail}` : ""}`,
    );
  }
  if ((adminProbe.stdout || "").trim() !== String(dbInfo.port)) {
    fail(`Admin PostgreSQL connection resolved to port ${(adminProbe.stdout || "").trim() || "unknown"} instead of expected ${dbInfo.port}.`);
  }

  const roleSql = `
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ${quoteLiteral(dbInfo.username)}) THEN
    CREATE ROLE ${quoteIdent(dbInfo.username)} LOGIN PASSWORD ${quoteLiteral(dbInfo.password)};
  ELSE
    ALTER ROLE ${quoteIdent(dbInfo.username)} LOGIN PASSWORD ${quoteLiteral(dbInfo.password)};
  END IF;
END
$$;
`.trim();
  run(psql, [...adminBaseArgs, "-v", "ON_ERROR_STOP=1", "-f", "-"], {
    input: `${roleSql}\n`,
  });

  const dbExists = run(psql, [...adminBaseArgs, "-Atqc", `SELECT 1 FROM pg_database WHERE datname = ${quoteLiteral(dbInfo.database)}`]);

  if (!dbExists) {
    run(psql, [...adminBaseArgs, "-v", "ON_ERROR_STOP=1", "-qc", `CREATE DATABASE ${quoteIdent(dbInfo.database)} OWNER ${quoteIdent(dbInfo.username)}`]);
  }

  run(
    psql,
    ["-h", dbInfo.host, "-p", String(dbInfo.port), "-U", dbInfo.username, "-d", dbInfo.database, "-Atqc", "SELECT 1"],
    {
      env: {
        ...process.env,
        PGPASSWORD: dbInfo.password,
      },
    },
  );

  console.log(`Local PostgreSQL is ready on ${dbInfo.host}:${dbInfo.port}/${dbInfo.database}`);
}

function ensureWindowsPostgres() {
  const scriptPath = path.join(__dirname, "ensure-local-postgres.ps1");
  if (!existsSync(scriptPath)) {
    fail(`Windows helper script is missing: ${scriptPath}`);
  }
  const result = spawnSync(
    "powershell",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      scriptPath,
      "-EnvFile",
      envFile,
    ],
    {
      stdio: "inherit",
    },
  );

  process.exit(result.status ?? 1);
}

const envValues = readDotEnv(envFile);
const dbInfo = parseDatabaseUrl(envValues.DATABASE_URL);

if (!dbInfo.username || !dbInfo.password || !dbInfo.database) {
  fail("DATABASE_URL must include username, password, and database name.");
}

if (os.platform() === "win32") {
  ensureWindowsPostgres();
} else {
  await ensureUnixPostgres(dbInfo);
}
