import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEffectiveOrgId } from "@/lib/auth/getEffectiveOrgId";

/**
 * GET /api/settings/ghl — fetch org's GHL settings
 */
export async function GET(request: Request) {
  try {
    const ctx = await getEffectiveOrgId(request);
    if (!ctx.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const orgId = ctx.effectiveOrgId;
    if (!orgId) {
      return NextResponse.json({ error: "No org context" }, { status: 400 });
    }

    const admin = createAdminClient();

    // Try fetching with GHL columns (requires migration 00004 + 00008)
    const { data, error } = await admin
      .from("organizations")
      .select("id, ghl_api_token, ghl_location_id, ghl_opening_pipeline_id")
      .eq("id", orgId)
      .single();

    if (error) {
      // If columns don't exist, migration hasn't been run
      if (
        error.message.includes("column") ||
        error.code === "42703" ||
        error.code === "PGRST204"
      ) {
        return NextResponse.json({
          id: orgId,
          ghl_api_token: null,
          ghl_location_id: null,
          ghl_opening_pipeline_id: null,
          migration_pending: true,
        });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/settings/ghl — save GHL credentials
 */
export async function PUT(request: Request) {
  try {
    const ctx = await getEffectiveOrgId(request);
    if (!ctx.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const orgId = ctx.effectiveOrgId;
    if (!orgId) {
      return NextResponse.json({ error: "No org context" }, { status: 400 });
    }

    const body = await request.json();
    const { ghl_api_token, ghl_location_id, ghl_opening_pipeline_id } = body;

    if (!ghl_api_token || !ghl_location_id) {
      return NextResponse.json(
        { error: "Both API token and Location ID are required" },
        { status: 400 }
      );
    }

    const admin = createAdminClient();
    const updates: Record<string, unknown> = { ghl_api_token, ghl_location_id };
    if (ghl_opening_pipeline_id !== undefined) {
      updates.ghl_opening_pipeline_id = ghl_opening_pipeline_id || null;
    }

    const { error } = await admin
      .from("organizations")
      .update(updates)
      .eq("id", orgId);

    if (error) {
      // Columns don't exist → migration not run
      if (
        error.message.includes("column") ||
        error.code === "42703" ||
        error.code === "PGRST204"
      ) {
        return NextResponse.json(
          {
            error:
              "Database migration required. Run supabase/migrations/00004_call_pipeline.sql in your Supabase SQL Editor.",
          },
          { status: 400 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
