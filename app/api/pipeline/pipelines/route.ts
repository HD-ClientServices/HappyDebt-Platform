/**
 * GET /api/pipeline/pipelines — list GHL pipelines for the location.
 * Used by Settings UI to pick the "opening pipeline".
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { GHLClient } from "@/lib/ghl/client";

export async function GET() {
  try {
    const userSupabase = await createClient();
    const {
      data: { user },
    } = await userSupabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: userData } = await admin
      .from("users")
      .select("org_id")
      .eq("id", user.id)
      .single();

    if (!userData) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const { data: org } = await admin
      .from("organizations")
      .select("ghl_api_token, ghl_location_id")
      .eq("id", userData.org_id)
      .single();

    if (!org?.ghl_api_token || !org?.ghl_location_id) {
      return NextResponse.json(
        { error: "GHL credentials not configured" },
        { status: 400 }
      );
    }

    const ghl = new GHLClient(org.ghl_api_token, org.ghl_location_id);
    const pipelines = await ghl.getPipelines();

    return NextResponse.json({ pipelines });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
