#!/usr/bin/env node
/**
 * Apply a Supabase SQL migration via the Management API.
 *
 * Usage:
 *   node scripts/apply-migration.mjs <path-to-sql-file>
 *   node scripts/apply-migration.mjs supabase/migrations/00016_pipelines_per_org.sql
 *
 * Environment (read from .env.local):
 *   SUPABASE_ACCESS_TOKEN — Personal Access Token from
 *       https://supabase.com/dashboard/account/tokens
 *   SUPABASE_PROJECT_REF  — the project ref, e.g. `ouszjnrkawvrwxjjgrxx`
 *       (it's the subdomain of your SUPABASE_URL)
 *
 * How it works:
 *   The Management API exposes
 *       POST https://api.supabase.com/v1/projects/{ref}/database/query
 *   which accepts arbitrary SQL in the body and runs it against the
 *   project's Postgres database. Unlike the REST API (PostgREST) this
 *   endpoint supports DDL — CREATE TABLE, ALTER TABLE, DROP COLUMN,
 *   CREATE FUNCTION, etc.
 *
 * Parsing / transactions:
 *   We send the ENTIRE file as one query. Supabase wraps the request
 *   in a single transaction, which matches the semantics of running
 *   the file manually in the SQL Editor (BEGIN; ...; COMMIT). That's
 *   what we want — if any statement fails, everything rolls back.
 *
 *   One gotcha: statements wrapped in `DO $$ ... END $$` blocks (like
 *   the idempotency guards in 00013) must keep their dollar quoting
 *   intact. Sending the raw file preserves that because we don't try
 *   to split on `;` ourselves.
 *
 * Exit codes:
 *   0  — migration applied successfully
 *   1  — file not found, env var missing, or SQL error
 */

import fs from "fs";
import path from "path";

// ── Load .env.local ────────────────────────────────────────────────
function loadEnv() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) {
    console.error(`❌ .env.local not found at ${envPath}`);
    console.error("   Run this script from the repo root.");
    process.exit(1);
  }
  const text = fs.readFileSync(envPath, "utf8");
  const env = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx < 0) continue;
    env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
  return env;
}

// ── ANSI helpers ──────────────────────────────────────────────────
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;

// ── Main ──────────────────────────────────────────────────────────
async function main() {
  const [, , sqlPath] = process.argv;

  if (!sqlPath) {
    console.error(red("Usage: node scripts/apply-migration.mjs <path-to-sql-file>"));
    console.error(dim("       e.g. node scripts/apply-migration.mjs supabase/migrations/00017_foo.sql"));
    process.exit(1);
  }

  const absPath = path.resolve(process.cwd(), sqlPath);
  if (!fs.existsSync(absPath)) {
    console.error(red(`❌ File not found: ${absPath}`));
    process.exit(1);
  }

  const env = loadEnv();
  const TOKEN = env.SUPABASE_ACCESS_TOKEN;
  const REF = env.SUPABASE_PROJECT_REF;

  if (!TOKEN) {
    console.error(red("❌ SUPABASE_ACCESS_TOKEN not set in .env.local"));
    console.error(dim("   Generate a PAT at https://supabase.com/dashboard/account/tokens"));
    process.exit(1);
  }
  if (!REF) {
    console.error(red("❌ SUPABASE_PROJECT_REF not set in .env.local"));
    console.error(dim("   It's the subdomain of your SUPABASE_URL, e.g. ouszjnrkawvrwxjjgrxx"));
    process.exit(1);
  }

  const sql = fs.readFileSync(absPath, "utf8");
  const fileName = path.basename(absPath);
  const lineCount = sql.split("\n").length;
  const byteCount = sql.length;

  console.log(bold(`\n▶ Applying migration: ${fileName}`));
  console.log(dim(`  lines: ${lineCount}`));
  console.log(dim(`  bytes: ${byteCount}`));
  console.log(dim(`  project: ${REF}`));
  console.log(dim(`  token: ${TOKEN.slice(0, 10)}...${TOKEN.slice(-4)}`));
  console.log();

  const url = `https://api.supabase.com/v1/projects/${REF}/database/query`;
  const t0 = Date.now();

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  });

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  const body = await res.text();

  if (!res.ok) {
    console.error(red(`❌ HTTP ${res.status} ${res.statusText} (${elapsed}s)`));
    try {
      const json = JSON.parse(body);
      console.error(red("\nError details:"));
      console.error(JSON.stringify(json, null, 2));
    } catch {
      console.error(body);
    }
    process.exit(1);
  }

  // Success — the body contains the result set of the LAST statement
  // in the file (or null for migrations that don't end in a SELECT).
  console.log(green(`✅ Migration applied successfully in ${elapsed}s`));

  let parsed = null;
  try {
    parsed = JSON.parse(body);
  } catch {
    // body is empty or not JSON — still success
  }

  if (parsed && Array.isArray(parsed) && parsed.length > 0) {
    console.log(dim(`\nLast statement returned ${parsed.length} row(s):`));
    console.log(JSON.stringify(parsed.slice(0, 10), null, 2));
    if (parsed.length > 10) {
      console.log(dim(`... and ${parsed.length - 10} more`));
    }
  } else if (parsed && Array.isArray(parsed) && parsed.length === 0) {
    console.log(dim("(no rows returned)"));
  }

  console.log();
}

main().catch((err) => {
  console.error(red(`❌ ${err.message}`));
  if (process.env.DEBUG) console.error(err.stack);
  process.exit(1);
});
