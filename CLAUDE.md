# Intro Platform — Claude Code project guide

Next.js 14 (App Router) + Supabase (Postgres + RLS + Auth) + Tailwind / shadcn dashboard for the **Intro** platform. Today's only client tenant is **Rise Alliance**, an MCA debt restructuring company — every feature is built to generalize to N tenants on the same codebase.

This file is the orientation doc Claude Code loads on startup. Read it first before making changes to the repo.

---

## Skills that apply to this project

Two Anthropic skills are **vendored into this repo** under `docs/skills/` so they're available to Claude Code sessions on every machine — local, CI, or Vercel build — even when the skills plugin isn't installed. When working on GHL-adjacent code, lean on them instead of guessing endpoint shapes or copying patterns from memory.

- **`docs/skills/ghl-api/SKILL.md`** — Expert knowledge of the GoHighLevel (GHL) API v2. Triggers: "GHL API", "create contact in GHL", "GHL webhook", "locationId", "pipelineId", OAuth, custom fields, contact/conversation/calendar/opportunity endpoints, request/response schemas. The skill has reference files for every GHL module under `docs/skills/ghl-api/references/`:
  - `calendars.md` · `contacts.md` · `conversations.md` · `custom-fields.md` · `locations.md` · `opportunities.md` · `other-modules.md` · `payments.md` · `users.md` · `webhooks.md`
- **`docs/skills/ghl-call-recordings/SKILL.md`** — Hard-won knowledge of how GHL stores and serves call recordings, the `?index=` gotcha for live transfers, n8n OOM patterns, and the Deepgram-vs-Whisper decision that shaped `lib/deepgram/client.ts`. References under `docs/skills/ghl-call-recordings/references/`:
  - `recording-api.md` — API download patterns, call selection
  - `n8n-patterns.md` — OOM gotchas, HTTP Request vs Code nodes
  - `transcription.md` — Deepgram vs Whisper, file size limits, language detection

Many of the non-obvious choices already in the codebase (Deepgram with `language=multi`, closer-first recording fallback, the cascade in `lib/pipeline/process-call.ts`) come from these skills — don't reverse them without re-reading the relevant reference first.

If you see an inline guess at a GHL endpoint URL, header shape, or webhook payload without first consulting the vendored references, that's a smell — read the file.

See `docs/skills/README.md` for the provenance of these copies and how to re-sync them with the upstream installed skills if they change.

**Other Anthropic skills** that may apply to adjacent work but are NOT vendored here (they're only available when the plugin is installed locally): `mca-lead-analytics`, `tanda-ghl`, `texttorrent-expert`, `openclaw`.

---

## Architecture snapshot

### Multi-tenancy

- **`public.organizations`** is the tenant table. Two orgs today:
  - `intro` — platform superadmin. Staff (@happydebt.com / @tryintro.com emails) live here. Never owns leads, calls, or live_transfers.
  - `rise` — the only real client tenant today. All live_transfers, calls, and leads belong to it.
- **`users.role`** values: `admin`, `manager`, `viewer`, `intro_admin`. Only `intro_admin` users can access `/dashboard/admin`, edit global GHL config, and impersonate other orgs.
- **Impersonation** (client-side UX convenience):
  - Zustand store: `store/impersonation-store.ts` (persisted to localStorage)
  - Header the client sends with every api-fetch: `x-impersonate-org-id` (via `lib/api-client.ts` → `apiFetch`)
  - Server-side resolver: `lib/auth/getEffectiveOrgId.ts`. Only honored for `intro_admin` users.
- **RLS** — every tenant table has an `is_intro_admin() OR org_id = user_org_id()` pattern. `is_intro_admin()` was broken after migration 00009 and fixed in 00014; `user_org_id()` pulls from `public.users.org_id` via SECURITY DEFINER.

### GHL integration layout

There is **one Go High Level account** for the whole platform. Credentials and config split across two layers:

1. **Global credentials** in the singleton `public.ghl_integration` table (migration 00015). One row enforced by a boolean PK + CHECK constraint. Columns:
   - `api_token` — GHL Private Integration Token
   - `location_id` — GHL sub-account ID
   - `reconnect_webhook_url` — Make.com webhook fired by the "Reconnect lead" button
   - `opening_pipeline_id`, `closing_pipeline_id` — **deprecated** after migration 00016; kept in the physical table but no code reads them. A future migration 00017 will drop them.

2. **Per-org pipelines** on `public.organizations` (migration 00016):
   - `ghl_opening_pipeline_id` — which GHL pipeline's won-opps become this org's `live_transfers`
   - `ghl_closing_pipeline_id` — the pipeline where closers work the deal

**Why the split**: each client org has its OWN opening/closing pipelines inside the shared GHL account. Routing a lead to the right tenant is done by matching pipeline IDs, not by impersonation headers. Migration 00015 originally put everything in the singleton and caused a data corruption bug where a sync from the wrong admin context silently moved 205 rows between orgs — 00016 is the fix.

**Read credentials via**: `lib/ghl/getGlobalConfig.ts`. Helpers:
- `getGHLGlobalConfig()` — throws `GHLNotConfiguredError` if credentials missing
- `getGHLGlobalConfigOrNull()` — graceful variant
- `getOrgPipelineConfig(orgId)` — per-org pipelines
- `listConfiguredOrgPipelines()` — every org with a configured opening pipeline (sync iterates this)
- `findOrgByPipelineId(pipelineId)` — reverse lookup for the webhook handler

**NEVER read GHL credentials from `process.env.GHL_API_TOKEN` / `GHL_LOCATION_ID`**. Those env vars exist only as a last-resort fallback for legacy jobs queued before migration 00015 and should be considered deprecated.

### Sync flow (`/api/pipeline/sync`)

The sync is what pulls fresh data from GHL into Supabase. Flow:

1. Auth: any authenticated user can trigger a sync.
2. Load global credentials via `getGHLGlobalConfig()`.
3. List configured orgs via `listConfiguredOrgPipelines()`. If empty → 400 with "No organizations have pipelines configured".
4. For each configured org, run `syncOneOrg(ghl, supabase, org)`:
   - Sync GHL users as closers for that org
   - Discover recent calls and queue them as `processing_jobs`
   - Fetch won opps from that org's opening pipeline, cross-match against closing pipeline by `contact_id`, and UPSERT into `live_transfers` with `org_id = org.id`
   - DB-level cleanup of stale rows scoped to that org
5. Fire pipeline workers for every queued job (fire-and-forget `POST /api/pipeline/process`).

**Critical invariant**: the sync NEVER uses `effectiveOrgId` to decide which org owns a row. Ownership is derived from the opp's pipeline_id at scrape time. Using `effectiveOrgId` was the bug behind the 00016 refactor — don't reintroduce it.

### Webhook flow (`/api/webhooks/ghl-call`)

Per-call webhook from GHL when a call-completed event fires:

1. Resolve owner org:
   - If payload has `pipeline_id` → `findOrgByPipelineId()` → that org wins
   - Else if exactly 1 org is configured → use that org
   - Else (2+ orgs, no pipeline_id) → 400 with "ambiguous routing" error
2. Never auto-route to the `intro` superadmin org.
3. Queue a `processing_jobs` row scoped to the resolved org.
4. Fire `/api/pipeline/process` inline (fire-and-forget) so calls analyze in near-real-time.

### QA analysis pipeline

- `lib/pipeline/process-call.ts` — orchestrates transcription → QA analysis → DB updates
- Transcription cascade: GHL built-in → Deepgram Nova-3 → Whisper (legacy fallback)
  - `lib/deepgram/client.ts` (primary; handles multi-language, no 25MB limit)
  - `lib/openai/client.ts` → `transcribeAudio()` (Whisper fallback)
- QA analysis: **GPT-4o** with a 5-pillar prompt replicated 1:1 from the production n8n workflow. See `lib/openai/client.ts` → `QA_SYSTEM_PROMPT_V2` (~15k chars, do not modify without reviewing the n8n source).
- Output schema: `QAAnalysisResultV2` in `lib/openai/types.ts`. Stored in `call_recordings.ai_analysis` as JSONB. Mapped to legacy `evaluation_score` (0-100 scale) so existing dashboard thresholds keep working.
- `lib/anthropic/client.ts` — legacy Claude analyzer, marked `@deprecated`. No code path imports from it.

### Cron / safety-net

- One cron in `vercel.json`: `17 4 * * *` → daily at 04:17 UTC. Hits `/api/cron/process-pending`.
- Vercel **Hobby tier only allows one daily cron** — do NOT add more or change to sub-daily. If you need more retries, trigger inline from webhook/sync instead.
- The cron is pure retry for jobs stuck in `pending` after an inline-trigger failure. 99% of jobs complete before it runs.

---

## Applying migrations (Management API workflow)

**You can apply migrations directly from this repo without touching the Supabase SQL Editor.** The project has two helper scripts that hit the Supabase Management API (`api.supabase.com/v1/projects/{ref}/database/query`) with arbitrary SQL — including DDL, which the REST API can't do.

### Setup (one-time)

Two env vars in `.env.local` (both gitignored):

```bash
SUPABASE_ACCESS_TOKEN=sbp_...          # PAT from https://supabase.com/dashboard/account/tokens
SUPABASE_PROJECT_REF=ouszjnrkawvrwxjjgrxx   # subdomain of SUPABASE_URL
```

The PAT is a workspace-level token with full database access. Keep it out of git, out of logs, and out of shared screens. Revoke it on the dashboard when the project ends.

### Apply a migration

```bash
node scripts/apply-migration.mjs supabase/migrations/00017_whatever.sql
```

- Sends the entire file as one query (Supabase wraps it in a transaction — all-or-nothing).
- Preserves dollar-quoted `DO $$ ... END $$` blocks intact, so idempotent guards like the one in 00013 work.
- Reports elapsed time and the result set of the last statement.
- Exit code 0 on success, 1 on any error.

### One-off queries

```bash
node scripts/db-query.mjs "SELECT slug, ghl_opening_pipeline_id FROM organizations"
node scripts/db-query.mjs -f some-query.sql
echo "SELECT count(*) FROM live_transfers" | node scripts/db-query.mjs -
```

Uses the same Management API endpoint. Great for verifying state before/after a migration (`"SELECT count(*) FROM ..."`), inspecting schema (`"SELECT column_name FROM information_schema.columns WHERE table_name = 'foo'"`), or debugging (`"SELECT * FROM pg_policies WHERE tablename = 'live_transfers'"`).

### When Claude Code is writing a migration

The standard workflow in this repo:

1. Claude writes the SQL file at `supabase/migrations/NNNNN_description.sql` following the conventions in the existing migrations (idempotent `IF NOT EXISTS`, `DO $$` guards for UPDATEs that reference columns that might be dropped later, RLS policies at the end).
2. Claude runs `node scripts/apply-migration.mjs supabase/migrations/NNNNN_description.sql` and reports the result.
3. Claude verifies the new state with `node scripts/db-query.mjs "..."` to confirm the migration did what it should.
4. Claude commits the migration file along with any code changes that depend on the new schema.

No more copy-pasting SQL into the Supabase SQL Editor.

---

## Migrations

Applied in order:

| # | File | Purpose |
|---|---|---|
| 00001 | `00001_initial_schema.sql` | Tables, RLS functions (`is_intro_admin`, `user_org_id`, `user_role`), core policies |
| 00002 | `00002_users_self_insert.sql` | Let a new signup create their own `users` row |
| 00003 | `00003_ghl_integration.sql` | `ghl_opportunity_id`, `ghl_conversation_id` UNIQUE constraints |
| 00004 | `00004_call_pipeline_safe.sql` | `processing_jobs` table + per-org GHL columns (later dropped) |
| 00005 | `00005_leads_restructure.sql` | `leads` table, migration from `live_transfers` |
| 00006 | `00006_design_tokens.sql` | Design tokens + a policy that originally had a string-literal role bug (fixed in 00014) |
| 00007 | `00007_nullable_closer_id.sql` | Allow null closer on a live_transfer |
| 00008 | `00008_opening_pipeline.sql` | Added `organizations.ghl_opening_pipeline_id` (later dropped by 00015, re-added by 00016) |
| 00009 | `00009_rebrand_to_intro.sql` | Renamed `is_happydebt_admin()` → `is_intro_admin()` and users.role `'happydebt_admin'` → `'intro_admin'`. ⚠️ Did NOT update the function body — fixed in 00014. |
| 00010 | `00010_auto_promote_intro_staff.sql` | Trigger that promotes @happydebt.com / @tryintro.com signups to `intro_admin` |
| 00011 | `00011_cleanup_orgs_and_invites.sql` | Cleanup 9 dev orgs → 2 + invite_token column |
| 00012 | `00012_domain_restricted_invites.sql` | Email domain restriction on shareable invite links |
| 00013 | `00013_live_transfers_v2.sql` | `live_transfers.status_change_date` / `closing_status` / `ghl_contact_id` + `live_transfer_feedback` table. UPDATE wrapped in a DO block so it's idempotent-safe after 00015 dropped the columns it seeds. |
| 00014 | `00014_fix_is_intro_admin_body.sql` | Rewrites the `is_intro_admin()` function body to compare against `'intro_admin'` (not the stale `'happydebt_admin'` literal). This was the root cause of the silent RLS bypass bug. |
| 00015 | `00015_unify_ghl_integration.sql` | Creates singleton `public.ghl_integration`. Collapsed GHL credentials + (originally) pipeline IDs into a single row. DROPs the `ghl_*` columns from `organizations`. |
| 00016 | `00016_pipelines_per_org.sql` | Re-adds `ghl_opening_pipeline_id` / `ghl_closing_pipeline_id` to `organizations` (00015 was wrong to put them in the singleton). Backfills Rise from the singleton. Moves orphaned `live_transfers` rows from Intro → Rise. Adds partial indexes on the new columns. |

When writing a new migration: make the UPDATE / DROP statements **idempotent** so re-running is safe (see `00013`'s `DO $$ ... END $$` column-exists guard as the pattern).

---

## Conventions

- **Path alias**: `@/` → repo root (`tsconfig.json` → `paths`).
- **Supabase clients**:
  - `lib/supabase/server.ts` → `createClient()` — server-side, respects user session
  - `lib/supabase/admin.ts` → `createAdminClient()` — service role, bypasses RLS (only for server routes and server components, never leak to the client)
  - `lib/supabase/client.ts` → `createClient()` — browser-side
- **API routes** that need the effective org (after impersonation) use `lib/auth/getEffectiveOrgId.ts`. Never read the header directly.
- **Client-side fetches** to `/api/*` use `apiFetch()` from `lib/api-client.ts` which auto-injects the impersonation header. Use raw `fetch` only when you're deliberately overriding the header (e.g. admin panels that address a specific org regardless of current impersonation).
- **React Query keys**: prefix by feature (`["live-transfers", ...]`, `["admin-org-pipelines", orgId]`). Invalidate by prefix when mutating.
- **Secrets**: `.env.local` is gitignored. Never commit `OPENAI_API_KEY`, `DEEPGRAM_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, etc.
- **Do not commit files under `.claude/`** — that directory has local Claude Code state (worktrees, agent memory, launch.json) and is in `.gitignore`.

---

## Known tech debt (TODOs)

- **GHL contact → org routing** when 2+ clients are onboarded. Today the webhook falls back to "single configured org". Fix: read a custom field on the GHL contact (e.g. `intro_org_slug`) and route by that, or fetch the contact's opportunities and match by pipeline_id.
- **Drop legacy singleton pipeline columns**: `ghl_integration.opening_pipeline_id` and `closing_pipeline_id` still exist in the physical table. Migration 00017 should drop them once we're confident nothing references them.
- **Multi-tenant calls-dedup**: the sync route discovers calls globally and queues per-org. With 2+ configured orgs the same call would be queued twice and the second insert would collide on `call_recordings_ghl_conversation_id_key`. Current noise level is acceptable (1 configured org), but the fix is to route calls by contact → org before queueing.
- **Retry UI**: the cron is daily — users have no manual "retry failed jobs" button. Add one if stuck-job complaints start appearing.
- **Cleanup old code paths**: `scripts/sync-ghl.ts` is a legacy one-shot script with an `ALLOW_LEGACY_GHL_SYNC` guard. Delete it once the team is confident it's never used.
