#!/usr/bin/env node
/**
 * Run a one-off SQL query against the Supabase project via the
 * Management API. Useful for quick lookups, schema inspection, and
 * verifying state before/after a migration.
 *
 * Usage:
 *   node scripts/db-query.mjs "SELECT slug, ghl_opening_pipeline_id FROM organizations"
 *   node scripts/db-query.mjs -f query.sql        # read from file
 *   cat query.sql | node scripts/db-query.mjs -   # read from stdin
 *
 * Environment (from .env.local):
 *   SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF
 *
 * Output: pretty-printed JSON rows.
 */

import fs from "fs";
import path from "path";

function loadEnv() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) {
    console.error("❌ .env.local not found — run from repo root");
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

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function main() {
  const args = process.argv.slice(2);
  let sql;

  if (args[0] === "-f" && args[1]) {
    sql = fs.readFileSync(args[1], "utf8");
  } else if (args[0] === "-") {
    sql = await readStdin();
  } else if (args.length > 0) {
    sql = args.join(" ");
  } else {
    console.error('Usage: node scripts/db-query.mjs "<SQL>"');
    console.error("       node scripts/db-query.mjs -f query.sql");
    console.error("       echo 'SELECT 1' | node scripts/db-query.mjs -");
    process.exit(1);
  }

  const env = loadEnv();
  const { SUPABASE_ACCESS_TOKEN: TOKEN, SUPABASE_PROJECT_REF: REF } = env;

  if (!TOKEN || !REF) {
    console.error(
      "❌ SUPABASE_ACCESS_TOKEN / SUPABASE_PROJECT_REF missing in .env.local"
    );
    process.exit(1);
  }

  const url = `https://api.supabase.com/v1/projects/${REF}/database/query`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  });

  const body = await res.text();

  if (!res.ok) {
    console.error(`❌ HTTP ${res.status}`);
    try {
      console.error(JSON.stringify(JSON.parse(body), null, 2));
    } catch {
      console.error(body);
    }
    process.exit(1);
  }

  try {
    const parsed = JSON.parse(body);
    console.log(JSON.stringify(parsed, null, 2));
  } catch {
    console.log(body);
  }
}

main().catch((err) => {
  console.error(`❌ ${err.message}`);
  process.exit(1);
});
