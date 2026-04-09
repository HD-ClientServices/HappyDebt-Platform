/**
 * GET /api/pipeline/pipelines — list GHL pipelines for the global account.
 *
 * Used by the Admin → GHL Integration panel to populate the
 * Opening / Closing pipeline dropdowns. Reads credentials from the
 * singleton `ghl_integration` row (migration 00015), not from any
 * per-org column — there is one Go High Level account for the entire
 * platform.
 *
 * Auth: requires an authenticated user. Pipeline names aren't secret,
 * so we don't gate this on intro_admin specifically. (The Save action
 * is gated separately on the admin endpoint.)
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { GHLClient } from "@/lib/ghl/client";
import {
  getGHLGlobalConfig,
  GHLNotConfiguredError,
} from "@/lib/ghl/getGlobalConfig";

export async function GET() {
  try {
    // Require an authenticated user (any role).
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const config = await getGHLGlobalConfig();
    const ghl = new GHLClient(config.apiToken, config.locationId);
    const pipelines = await ghl.getPipelines();

    return NextResponse.json({ pipelines });
  } catch (error) {
    if (error instanceof GHLNotConfiguredError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
