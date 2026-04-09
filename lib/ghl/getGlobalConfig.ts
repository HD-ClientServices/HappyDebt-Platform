/**
 * Server-side helpers for loading GHL config.
 *
 * ## Split responsibility (post migration 00016)
 *
 * GHL config is split between two layers:
 *
 *   - **Global credentials** live in the singleton `public.ghl_integration`
 *     row. There is one GHL account for the entire platform, with one
 *     api_token, one location_id, and one reconnect webhook URL. Loaded
 *     via `getGHLGlobalConfig()`.
 *   - **Per-org pipelines** live on `public.organizations` as
 *     `ghl_opening_pipeline_id` + `ghl_closing_pipeline_id`. Each client
 *     org has its own opening/closing pipeline inside the shared GHL
 *     account. Loaded via `getOrgPipelineConfig(orgId)` or the list
 *     variant `listConfiguredOrgPipelines()`.
 *
 * Migration 00015 originally put the pipeline IDs in the singleton too,
 * but that modeling was wrong and caused a data corruption bug where
 * live_transfers rows silently migrated between orgs during sync (see
 * migration 00016 header for the full writeup). After 00016, the
 * singleton still HAS `opening_pipeline_id` / `closing_pipeline_id`
 * columns for backward-compat but no code path reads them — they're
 * deprecated and will be dropped in a future migration.
 *
 * Every route that needs GHL config goes through these helpers. They
 * use the admin Supabase client so they bypass RLS — callers are still
 * responsible for their own authorization (e.g. requireIntroAdmin for
 * the admin write path, any-authenticated-user for read-only sync).
 *
 * None of these helpers cache. Each call is one indexed SELECT; if
 * we see them become hot we can wrap in React `cache()` or
 * unstable_cache later.
 */

import { createAdminClient } from "@/lib/supabase/admin";

export interface GHLGlobalConfig {
  /** GHL Private Integration Token (`pit-...`). */
  apiToken: string;
  /** GHL location ID — the sub-account the token is scoped to. */
  locationId: string;
  /**
   * Make.com / GHL webhook URL fired by the "Reconnect lead" button.
   * Receives `{ contactId, source: "intro_platform_recontact" }`.
   */
  reconnectWebhookUrl: string | null;
}

/**
 * Per-org pipeline config loaded from `public.organizations`.
 * Returned by `getOrgPipelineConfig(orgId)` and `listConfiguredOrgPipelines()`.
 */
export interface OrgPipelineConfig {
  orgId: string;
  orgSlug: string;
  orgName: string;
  openingPipelineId: string | null;
  closingPipelineId: string | null;
}

/**
 * Raised when the singleton row exists but `api_token` / `location_id`
 * are blank — i.e. the integration has never been configured.
 *
 * Routes that catch this should return a 4xx with a "Not configured"
 * message, not a 5xx — it's a setup state, not a code bug.
 */
export class GHLNotConfiguredError extends Error {
  constructor(missing: string[]) {
    super(
      `GHL integration is not configured. Missing: ${missing.join(", ")}. ` +
        `An Intro admin must set this up under Admin → GHL Integration.`
    );
    this.name = "GHLNotConfiguredError";
  }
}

/**
 * Load the global GHL credentials. Throws `GHLNotConfiguredError` if
 * `api_token` or `location_id` are missing.
 *
 * The reconnect webhook is returned as nullable — that's optional and
 * individual callers decide whether to fail if it's unset.
 *
 * @example
 *   try {
 *     const cfg = await getGHLGlobalConfig();
 *     const ghl = new GHLClient(cfg.apiToken, cfg.locationId);
 *   } catch (err) {
 *     if (err instanceof GHLNotConfiguredError) {
 *       return NextResponse.json({ error: err.message }, { status: 400 });
 *     }
 *     throw err;
 *   }
 */
export async function getGHLGlobalConfig(): Promise<GHLGlobalConfig> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("ghl_integration")
    .select("api_token, location_id, reconnect_webhook_url")
    .eq("id", true)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load GHL integration: ${error.message}`);
  }

  if (!data) {
    throw new GHLNotConfiguredError(["row missing — run migration 00015"]);
  }

  const missing: string[] = [];
  if (!data.api_token) missing.push("api_token");
  if (!data.location_id) missing.push("location_id");
  if (missing.length > 0) {
    throw new GHLNotConfiguredError(missing);
  }

  return {
    apiToken: data.api_token as string,
    locationId: data.location_id as string,
    reconnectWebhookUrl: data.reconnect_webhook_url ?? null,
  };
}

/**
 * Variant that returns `null` instead of throwing when the integration
 * is not configured. Useful for routes that want to gracefully degrade
 * (e.g. the admin UI rendering an empty form on first install).
 */
export async function getGHLGlobalConfigOrNull(): Promise<GHLGlobalConfig | null> {
  try {
    return await getGHLGlobalConfig();
  } catch (err) {
    if (err instanceof GHLNotConfiguredError) return null;
    throw err;
  }
}

/**
 * Load pipeline config for a specific org.
 *
 * Returns null if the org doesn't exist. Returns the row (possibly
 * with null pipeline IDs) if the org exists but hasn't been configured
 * yet — the caller decides what to do. The sync route treats that
 * org as "not configured, skip"; the admin config dialog treats it
 * as "empty form, let the user fill it in".
 */
export async function getOrgPipelineConfig(
  orgId: string
): Promise<OrgPipelineConfig | null> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("organizations")
    .select("id, slug, name, ghl_opening_pipeline_id, ghl_closing_pipeline_id")
    .eq("id", orgId)
    .maybeSingle();

  if (error || !data) return null;

  return {
    orgId: data.id as string,
    orgSlug: data.slug as string,
    orgName: data.name as string,
    openingPipelineId: data.ghl_opening_pipeline_id ?? null,
    closingPipelineId: data.ghl_closing_pipeline_id ?? null,
  };
}

/**
 * List every org that has at least an opening pipeline configured.
 *
 * This is what the sync route iterates over: only orgs with a
 * configured opening pipeline are candidates for syncing live_transfers.
 * Orgs without pipeline IDs are silently skipped (they haven't been
 * onboarded yet, or they're admin-only orgs like `intro`).
 *
 * Results are ordered by slug for deterministic sync output and
 * predictable log messages.
 */
export async function listConfiguredOrgPipelines(): Promise<OrgPipelineConfig[]> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("organizations")
    .select("id, slug, name, ghl_opening_pipeline_id, ghl_closing_pipeline_id")
    .not("ghl_opening_pipeline_id", "is", null)
    .order("slug", { ascending: true });

  if (error) {
    throw new Error(`Failed to list configured orgs: ${error.message}`);
  }

  return (data ?? []).map((o) => ({
    orgId: o.id as string,
    orgSlug: o.slug as string,
    orgName: o.name as string,
    openingPipelineId: o.ghl_opening_pipeline_id ?? null,
    closingPipelineId: o.ghl_closing_pipeline_id ?? null,
  }));
}

/**
 * Reverse lookup: given a GHL pipeline ID (either opening or closing),
 * find the org that owns it. Used by the webhook handler to route an
 * incoming call to the correct tenant.
 *
 * Returns null if no org matches. If two orgs claim the same pipeline
 * ID (shouldn't happen in practice), returns the first match ordered
 * by slug.
 */
export async function findOrgByPipelineId(
  pipelineId: string
): Promise<OrgPipelineConfig | null> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("organizations")
    .select("id, slug, name, ghl_opening_pipeline_id, ghl_closing_pipeline_id")
    .or(
      `ghl_opening_pipeline_id.eq.${pipelineId},ghl_closing_pipeline_id.eq.${pipelineId}`
    )
    .order("slug", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  return {
    orgId: data.id as string,
    orgSlug: data.slug as string,
    orgName: data.name as string,
    openingPipelineId: data.ghl_opening_pipeline_id ?? null,
    closingPipelineId: data.ghl_closing_pipeline_id ?? null,
  };
}
