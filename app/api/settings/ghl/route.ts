import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Get the authenticated user's org_id from session cookies.
 */
async function getAuthOrgId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("users")
    .select("org_id")
    .eq("id", user.id)
    .single();

  return profile?.org_id ?? null;
}

/**
 * GET /api/settings/ghl — fetch org's GHL settings
 */
export async function GET() {
  try {
    const orgId = await getAuthOrgId();
    if (!orgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();

    // Try fetching with GHL columns (requires migration 00004)
    const { data, error } = await admin
      .from("organizations")
      .select("id, ghl_api_token, ghl_location_id")
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
    const orgId = await getAuthOrgId();
    if (!orgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { ghl_api_token, ghl_location_id } = body;

    if (!ghl_api_token || !ghl_location_id) {
      return NextResponse.json(
        { error: "Both API token and Location ID are required" },
        { status: 400 }
      );
    }

    const admin = createAdminClient();
    const { error } = await admin
      .from("organizations")
      .update({ ghl_api_token, ghl_location_id })
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
