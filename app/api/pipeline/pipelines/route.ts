/**
 * GET /api/pipeline/pipelines — list GHL pipelines for the location.
 * Used by Settings UI to pick the "opening pipeline".
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { GHLClient } from "@/lib/ghl/client";
import { getEffectiveOrgId } from "@/lib/auth/getEffectiveOrgId";

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
    const { data: org } = await admin
      .from("organizations")
      .select("ghl_api_token, ghl_location_id")
      .eq("id", orgId)
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
