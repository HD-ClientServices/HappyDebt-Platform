/**
 * PUT /api/admin/orgs/[orgId]/config
 *
 * Body: {
 *   ghl_opening_pipeline_id?: string | null,
 *   ghl_closing_pipeline_id?: string | null,
 *   ghl_reconnect_webhook_url?: string | null,
 * }
 *
 * Updates the GHL configuration for a specific organization. Only
 * accessible by intro_admin users (Intro staff).
 *
 * GET /api/admin/orgs/[orgId]/config
 * Returns the current configuration values for that org (intro_admin only).
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

function isStaffEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const lower = email.toLowerCase();
  return lower.endsWith("@happydebt.com") || lower.endsWith("@tryintro.com");
}

async function requireIntroAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401, error: "Unauthorized" };

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
  return { ok: true, admin };
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
    .select(
      "id, name, slug, ghl_api_token, ghl_location_id, ghl_opening_pipeline_id, ghl_closing_pipeline_id, ghl_reconnect_webhook_url"
    )
    .eq("id", orgId)
    .maybeSingle();

  if (error || !data) {
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

  const updates: Record<string, unknown> = {};

  if (body.ghl_opening_pipeline_id !== undefined) {
    updates.ghl_opening_pipeline_id =
      typeof body.ghl_opening_pipeline_id === "string" &&
      body.ghl_opening_pipeline_id.trim().length > 0
        ? body.ghl_opening_pipeline_id.trim()
        : null;
  }
  if (body.ghl_closing_pipeline_id !== undefined) {
    updates.ghl_closing_pipeline_id =
      typeof body.ghl_closing_pipeline_id === "string" &&
      body.ghl_closing_pipeline_id.trim().length > 0
        ? body.ghl_closing_pipeline_id.trim()
        : null;
  }
  if (body.ghl_reconnect_webhook_url !== undefined) {
    updates.ghl_reconnect_webhook_url =
      typeof body.ghl_reconnect_webhook_url === "string" &&
      body.ghl_reconnect_webhook_url.trim().length > 0
        ? body.ghl_reconnect_webhook_url.trim()
        : null;
  }

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
      "id, name, slug, ghl_opening_pipeline_id, ghl_closing_pipeline_id, ghl_reconnect_webhook_url"
    )
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, org: data });
}
