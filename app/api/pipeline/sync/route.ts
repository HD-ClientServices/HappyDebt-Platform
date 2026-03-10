/**
 * Manual Sync — fetches recent calls from GHL and queues them for processing.
 * Authenticated by user session.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { GHLClient } from "@/lib/ghl/client";

export async function POST(req: NextRequest) {
  try {
    // Authenticate the user
    const userSupabase = await createClient();
    const { data: { user } } = await userSupabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's org and GHL credentials
    const adminSupabase = createAdminClient();
    const { data: userData } = await adminSupabase
      .from("users")
      .select("org_id")
      .eq("id", user.id)
      .single();

    if (!userData) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const { data: org } = await adminSupabase
      .from("organizations")
      .select("id, ghl_api_token, ghl_location_id")
      .eq("id", userData.org_id)
      .single();

    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    const ghlToken = org.ghl_api_token || process.env.GHL_API_TOKEN;
    const ghlLocationId = org.ghl_location_id || process.env.GHL_LOCATION_ID;

    if (!ghlToken || !ghlLocationId) {
      return NextResponse.json(
        { error: "GHL credentials not configured. Go to Settings to add them." },
        { status: 400 }
      );
    }

    const ghl = new GHLClient(ghlToken, ghlLocationId);

    // Get GHL users to sync closers first
    const ghlUsers = await ghl.getUsers();
    for (const u of ghlUsers) {
      if (u.deleted) continue;
      const { data: existing } = await adminSupabase
        .from("closers")
        .select("id")
        .eq("ghl_user_id", u.id)
        .eq("org_id", org.id)
        .maybeSingle();

      if (!existing) {
        await adminSupabase.from("closers").insert({
          org_id: org.id,
          ghl_user_id: u.id,
          name: u.name,
          email: u.email,
          phone: u.phone,
          avatar_url: u.profilePhoto || null,
          active: true,
        });
      }
    }

    // Get existing ghl_conversation_ids to avoid duplicates
    const { data: existingRecordings } = await adminSupabase
      .from("call_recordings")
      .select("ghl_conversation_id")
      .eq("org_id", org.id)
      .not("ghl_conversation_id", "is", null);

    const existingConvIds = new Set(
      (existingRecordings || []).map((r: { ghl_conversation_id: string }) => r.ghl_conversation_id)
    );

    // Note: GHL doesn't have a direct "list all calls" endpoint.
    // The user can provide a contact_id to sync specific contacts,
    // or we use the webhook for real-time processing.
    // For manual sync, we'll return the number of closers synced.
    return NextResponse.json({
      success: true,
      closers_synced: ghlUsers.filter((u) => !u.deleted).length,
      message: "Closers synced. For call processing, configure the GHL webhook to send events automatically.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[sync] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
