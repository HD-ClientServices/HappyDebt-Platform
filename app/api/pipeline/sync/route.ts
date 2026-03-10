/**
 * Manual Sync — discovers recent calls from GHL and queues them for processing.
 *
 * Strategy:
 * 1. Sync GHL users as closers
 * 2. Use discoverRecentCalls() to scan conversations for TYPE_CALL messages
 * 3. Dedup against existing call_recordings (by ghl_message_id)
 * 4. Create processing_jobs for new calls
 * 5. Trigger the pipeline worker for each job
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { GHLClient } from "@/lib/ghl/client";

export const maxDuration = 60; // Allow up to 60s for this route

export async function POST() {
  try {
    // Authenticate the user
    const userSupabase = await createClient();
    const {
      data: { user },
    } = await userSupabase.auth.getUser();

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
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    const ghlToken = org.ghl_api_token || process.env.GHL_API_TOKEN;
    const ghlLocationId = org.ghl_location_id || process.env.GHL_LOCATION_ID;

    if (!ghlToken || !ghlLocationId) {
      return NextResponse.json(
        {
          error:
            "GHL credentials not configured. Go to Settings to add them.",
        },
        { status: 400 }
      );
    }

    const ghl = new GHLClient(ghlToken, ghlLocationId);

    // ── Step 1: Sync GHL users as closers ──────────────────────────
    let closersSynced = 0;
    const ghlUsers = await ghl.getUsers();
    const closerMap = new Map<string, string>(); // ghl_user_id → closer.id

    for (const u of ghlUsers) {
      if (u.deleted) continue;

      const { data: existing } = await adminSupabase
        .from("closers")
        .select("id, ghl_user_id")
        .eq("ghl_user_id", u.id)
        .eq("org_id", org.id)
        .maybeSingle();

      if (existing) {
        closerMap.set(u.id, existing.id);
      } else {
        const { data: newCloser } = await adminSupabase
          .from("closers")
          .insert({
            org_id: org.id,
            ghl_user_id: u.id,
            name: u.name,
            email: u.email,
            phone: u.phone,
            avatar_url: u.profilePhoto || null,
            active: true,
          })
          .select("id")
          .single();

        if (newCloser) {
          closerMap.set(u.id, newCloser.id);
          closersSynced++;
        }
      }
    }

    // ── Step 2: Discover recent calls from GHL ─────────────────────
    console.log("[sync] Discovering recent calls from GHL...");
    const discoveredCalls = await ghl.discoverRecentCalls(100);
    console.log(`[sync] Found ${discoveredCalls.length} completed call(s)`);

    // ── Step 3: Dedup against existing recordings ──────────────────
    const { data: existingRecordings } = await adminSupabase
      .from("call_recordings")
      .select("ghl_message_id, ghl_conversation_id")
      .eq("org_id", org.id);

    const existingMessageIds = new Set(
      (existingRecordings || [])
        .map((r: { ghl_message_id: string | null }) => r.ghl_message_id)
        .filter(Boolean)
    );
    const existingConvIds = new Set(
      (existingRecordings || [])
        .map(
          (r: { ghl_conversation_id: string | null }) =>
            r.ghl_conversation_id
        )
        .filter(Boolean)
    );

    const newCalls = discoveredCalls.filter(
      (call) =>
        !existingMessageIds.has(call.messageId) &&
        !existingConvIds.has(call.conversationId)
    );

    console.log(
      `[sync] ${newCalls.length} new call(s) after dedup (${discoveredCalls.length - newCalls.length} already exist)`
    );

    // ── Step 4: Create processing jobs for new calls ───────────────
    let jobsCreated = 0;
    const jobIds: string[] = [];

    for (const call of newCalls) {
      // Try to match a closer by name
      let closerId: string | null = null;
      if (call.assignedUser) {
        // Try to find by GHL user id
        closerId = closerMap.get(call.assignedUser) || null;
      }
      if (!closerId) {
        // Try to find by name match
        const { data: closerByName } = await adminSupabase
          .from("closers")
          .select("id")
          .eq("org_id", org.id)
          .ilike("name", `%${call.contactName.split(" ")[0]}%`)
          .maybeSingle();
        // Don't use contact name to match closer — we'll leave it null
        closerId = null;
        void closerByName; // suppress unused warning
      }

      const payload = {
        contact_id: call.contactId,
        contact_name: call.contactName,
        contact_phone: call.contactPhone,
        call_duration: call.duration,
        business_name: "",
        closer: "",
        message_id: call.messageId,
        conversation_id: call.conversationId,
        direction: call.direction,
        call_date: call.callDate,
      };

      const { data: job, error: jobError } = await adminSupabase
        .from("processing_jobs")
        .insert({
          org_id: org.id,
          status: "pending",
          job_type: "call_qa",
          payload,
          attempts: 0,
          max_attempts: 3,
        })
        .select("id")
        .single();

      if (jobError) {
        console.error(`[sync] Failed to create job for ${call.messageId}:`, jobError.message);
        continue;
      }

      jobIds.push(job.id);
      jobsCreated++;
    }

    // ── Step 5: Trigger the pipeline worker for each job ───────────
    // Fire-and-forget calls to the worker — don't await to avoid timeout
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    for (const jobId of jobIds) {
      try {
        fetch(`${baseUrl}/api/pipeline/process`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-pipeline-secret": process.env.PIPELINE_SECRET || "",
          },
          body: JSON.stringify({ jobId }),
        }).catch((err) => {
          console.warn(`[sync] Failed to trigger worker for job ${jobId}:`, err);
        });
      } catch {
        // Ignore — fire and forget
      }
    }

    return NextResponse.json({
      success: true,
      closers_synced: closersSynced,
      calls_discovered: discoveredCalls.length,
      calls_new: newCalls.length,
      calls_duplicate: discoveredCalls.length - newCalls.length,
      jobs_created: jobsCreated,
      message:
        jobsCreated > 0
          ? `Found ${newCalls.length} new call(s). Processing ${jobsCreated} call(s) in background...`
          : discoveredCalls.length > 0
            ? `Found ${discoveredCalls.length} call(s) but all already synced.`
            : "No completed calls found in recent GHL conversations.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[sync] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
