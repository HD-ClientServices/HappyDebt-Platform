/**
 * GET / PUT /api/admin/orgs/[orgId]/pipelines
 *
 * Read and write the per-org GHL pipeline IDs. This is the only
 * endpoint that touches `organizations.ghl_opening_pipeline_id` and
 * `organizations.ghl_closing_pipeline_id` from the admin UI.
 *
 * Both verbs are restricted to intro_admin staff. The sync route
 * reads these columns via `listConfiguredOrgPipelines()` to decide
 * which orgs to run the sync for and which pipelines to fetch from
 * GHL; the webhook handler reads them via `findOrgByPipelineId()` to
 * route incoming calls to the correct tenant.
 *
 * Body shape (PUT):
 *   {
 *     ghl_opening_pipeline_id?: string | null,
 *     ghl_closing_pipeline_id?: string | null,
 *   }
 *
 * Any field omitted is left unchanged. Empty string normalizes to
 * null (cleared). Writing both fields to null effectively un-configures
 * the org, which makes the sync skip it and the webhook handler
 * refuse to route calls to it.
 *
 * Credentials (api_token, location_id) and the reconnect webhook URL
 * are GLOBAL — edit them via `/api/admin/ghl-integration` instead.
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

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const auth = await requireIntroAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { orgId } = await params;

  const { data, error } = await auth.admin!
    .from("organizations")
    .select("id, slug, name, ghl_opening_pipeline_id, ghl_closing_pipeline_id")
    .eq("id", orgId)
    .maybeSingle();

  if (error) {
    // The most likely cause is migration 00016 not yet applied.
    if (
      error.message.includes("column") ||
      error.code === "42703" ||
      error.code === "PGRST204"
    ) {
      return NextResponse.json(
        {
          error:
            "Database migration required. Run supabase/migrations/00016_pipelines_per_org.sql in the Supabase SQL Editor.",
        },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Org not found" }, { status: 404 });
  }

  return NextResponse.json(data);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const auth = await requireIntroAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { orgId } = await params;
  const body = await req.json().catch(() => ({}));

  // Helper: undefined → skip, null/"" → null, string → trimmed.
  // Same shape as /api/admin/ghl-integration/route.ts.
  const normalize = (v: unknown): string | null | undefined => {
    if (v === undefined) return undefined;
    if (v === null) return null;
    if (typeof v !== "string") return undefined;
    const trimmed = v.trim();
    return trimmed.length > 0 ? trimmed : null;
  };

  const updates: Record<string, unknown> = {};

  const opening = normalize(body.ghl_opening_pipeline_id);
  if (opening !== undefined) updates.ghl_opening_pipeline_id = opening;

  const closing = normalize(body.ghl_closing_pipeline_id);
  if (closing !== undefined) updates.ghl_closing_pipeline_id = closing;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "No fields to update" },
      { status: 400 }
    );
  }

  const { data, error } = await auth.admin!
    .from("organizations")
    .update(updates)
    .eq("id", orgId)
    .select(
      "id, slug, name, ghl_opening_pipeline_id, ghl_closing_pipeline_id"
    )
    .single();

  if (error) {
    if (
      error.message.includes("column") ||
      error.code === "42703" ||
      error.code === "PGRST204"
    ) {
      return NextResponse.json(
        {
          error:
            "Database migration required. Run supabase/migrations/00016_pipelines_per_org.sql in the Supabase SQL Editor.",
        },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, org: data });
}
