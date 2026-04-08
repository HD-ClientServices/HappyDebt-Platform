/**
 * Server-side helper that loads the singleton GHL integration config.
 *
 * Migration `00015_unify_ghl_integration.sql` collapsed the per-org
 * `organizations.ghl_*` columns into a single global `ghl_integration`
 * row (there is only one Go High Level account for the entire product —
 * see the migration header for the why).
 *
 * Every API route that needs GHL credentials, pipeline IDs, or the
 * reconnect webhook URL goes through this helper. It uses the admin
 * Supabase client so it bypasses RLS — callers are still responsible
 * for their own authorization (e.g. requireIntroAdmin in the admin
 * write path, or just any-authenticated-user for read-only sync).
 *
 * The helper does NOT cache. The singleton row is one read against an
 * indexed PK; no need to invalidate. If we ever see this become hot
 * we can add a per-request memo via React `cache()` or unstable_cache.
 */

import { createAdminClient } from "@/lib/supabase/admin";

export interface GHLGlobalConfig {
  /** GHL Private Integration Token (`pit-...`). */
  apiToken: string;
  /** GHL location ID — the sub-account the token is scoped to. */
  locationId: string;
  /** Pipeline whose `won` opportunities count as live transfers. */
  openingPipelineId: string | null;
  /** Pipeline closers work the deal in. Used to derive `closing_status`. */
  closingPipelineId: string | null;
  /**
   * Make.com / GHL webhook URL fired by the "Reconnect lead" button.
   * Receives `{ contactId, source: "intro_platform_recontact" }`.
   */
  reconnectWebhookUrl: string | null;
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
 * Load the global GHL config. Throws `GHLNotConfiguredError` if the
 * required credentials (api_token + location_id) are missing.
 *
 * Pipeline IDs and the reconnect webhook are returned as nullable —
 * those are optional, and individual callers decide whether to fail.
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
    .select(
      "api_token, location_id, opening_pipeline_id, closing_pipeline_id, reconnect_webhook_url"
    )
    .eq("id", true)
    .maybeSingle();

  if (error) {
    // The migration creates the singleton row at install time, so a
    // missing row would be a real DB problem (not user error).
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
    openingPipelineId: data.opening_pipeline_id ?? null,
    closingPipelineId: data.closing_pipeline_id ?? null,
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
