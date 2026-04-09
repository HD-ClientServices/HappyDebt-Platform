/**
 * GET / PUT /api/admin/ghl-integration
 *
 * Read and write the global Go High Level configuration. This is the
 * ONLY endpoint that touches `public.ghl_integration` from the UI.
 * Both verbs are restricted to intro_admin staff — the credentials
 * grant full access to the GHL account, so client users (and even
 * regular org admins) must never see them.
 *
 * The route deliberately does NOT take an `orgId` path param. There
 * is one Go High Level account for the entire platform, mapped to
 * one row in `ghl_integration` (singleton enforced by a CHECK
 * constraint on a boolean PK). See migration `00015_unify_ghl_integration`.
 *
 * Body shape (PUT):
 *   {
 *     api_token?: string | null,
 *     location_id?: string | null,
 *     opening_pipeline_id?: string | null,
 *     closing_pipeline_id?: string | null,
 *     reconnect_webhook_url?: string | null,
 *   }
 *
 * Any field omitted is left unchanged. An explicit `null` (or empty
 * string, which is normalized to null) clears that field. The PUT
 * also stamps `updated_at` and `updated_by` (the calling admin).
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

function isStaffEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const lower = email.toLowerCase();
  return lower.endsWith("@happydebt.com") || lower.endsWith("@tryintro.com");
}

interface AuthResult {
  ok: boolean;
  status: number;
  error?: string;
  userId?: string;
  admin?: ReturnType<typeof createAdminClient>;
}

async function requireIntroAdmin(): Promise<AuthResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  const isAdmin = isStaffEmail(user.email) || profile?.role === "intro_admin";
  if (!isAdmin) {
    return { ok: false, status: 403, error: "Forbidden" };
  }

  return { ok: true, status: 200, userId: user.id, admin };
}

export async function GET() {
  const auth = await requireIntroAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  // The migration always inserts the singleton row at install time, so
  // a missing row would be a real DB issue (not user error). We still
  // handle it gracefully by returning an empty config so the admin UI
  // can render an empty form rather than crash.
  const { data, error } = await auth.admin!
    .from("ghl_integration")
    .select(
      "api_token, location_id, opening_pipeline_id, closing_pipeline_id, reconnect_webhook_url, updated_at, updated_by"
    )
    .eq("id", true)
    .maybeSingle();

  if (error) {
    // The most likely cause here is migration 00015 not yet applied.
    if (
      error.message.includes("relation") ||
      error.code === "42P01" ||
      error.code === "PGRST205"
    ) {
      return NextResponse.json({
        api_token: null,
        location_id: null,
        opening_pipeline_id: null,
        closing_pipeline_id: null,
        reconnect_webhook_url: null,
        migration_pending: true,
      });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    data ?? {
      api_token: null,
      location_id: null,
      opening_pipeline_id: null,
      closing_pipeline_id: null,
      reconnect_webhook_url: null,
    }
  );
}

export async function PUT(req: NextRequest) {
  const auth = await requireIntroAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await req.json().catch(() => ({}));

  // Helper: undefined → skip, null/"" → null, string → trimmed string.
  // The same shape as the per-org endpoint we removed.
  const normalize = (v: unknown): string | null | undefined => {
    if (v === undefined) return undefined;
    if (v === null) return null;
    if (typeof v !== "string") return undefined;
    const trimmed = v.trim();
    return trimmed.length > 0 ? trimmed : null;
  };

  const updates: Record<string, unknown> = {
    updated_by: auth.userId,
  };

  const apiToken = normalize(body.api_token);
  if (apiToken !== undefined) updates.api_token = apiToken;

  const locationId = normalize(body.location_id);
  if (locationId !== undefined) updates.location_id = locationId;

  const openingPipeline = normalize(body.opening_pipeline_id);
  if (openingPipeline !== undefined)
    updates.opening_pipeline_id = openingPipeline;

  const closingPipeline = normalize(body.closing_pipeline_id);
  if (closingPipeline !== undefined)
    updates.closing_pipeline_id = closingPipeline;

  const reconnectWebhook = normalize(body.reconnect_webhook_url);
  if (reconnectWebhook !== undefined)
    updates.reconnect_webhook_url = reconnectWebhook;

  // Only the timestamp fields would be set if the body was empty —
  // reject that as a no-op so we don't bump updated_at without reason.
  if (Object.keys(updates).length <= 1) {
    return NextResponse.json(
      { error: "No fields to update" },
      { status: 400 }
    );
  }

  // UPSERT against the singleton id=true. Using upsert (rather than
  // update) makes the route idempotent on a fresh install where the
  // migration's INSERT didn't run yet for some reason.
  const { data, error } = await auth.admin!
    .from("ghl_integration")
    .upsert({ id: true, ...updates }, { onConflict: "id" })
    .select(
      "api_token, location_id, opening_pipeline_id, closing_pipeline_id, reconnect_webhook_url, updated_at, updated_by"
    )
    .single();

  if (error) {
    if (
      error.message.includes("relation") ||
      error.code === "42P01" ||
      error.code === "PGRST205"
    ) {
      return NextResponse.json(
        {
          error:
            "Database migration required. Run supabase/migrations/00015_unify_ghl_integration.sql in the Supabase SQL Editor.",
        },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, config: data });
}
