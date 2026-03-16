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
import { findOrCreateCloser } from "@/lib/pipeline/closers";

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

    // ── Step 1: Discover recent calls from GHL ─────────────────────
    console.log("[sync] Discovering recent calls from GHL...");
    const discoveredCalls = await ghl.discoverRecentCalls(100);
    console.log(`[sync] Found ${discoveredCalls.length} completed call(s)`);

    // ── Step 2: Dedup against existing recordings ──────────────────
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

    // ── Step 3: Create processing jobs for new calls ───────────────
    let jobsCreated = 0;
    const jobIds: string[] = [];

    for (const call of newCalls) {
      // Resolve closer from the contact's custom field {{contact.closer}}
      let closerId: string | null = null;
      if (call.closerName) {
        closerId = await findOrCreateCloser(adminSupabase, org.id, call.closerName);
      }

      const payload = {
        contact_id: call.contactId,
        contact_name: call.contactName,
        contact_phone: call.contactPhone,
        call_duration: call.duration,
        business_name: "",
        closer: call.closerName || "",
        closer_id: closerId,
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

    // ── Step 4: Also pick up any previously-pending jobs (e.g. from failed retries)
    const { data: allPendingJobs } = await adminSupabase
      .from("processing_jobs")
      .select("id")
      .eq("org_id", org.id)
      .eq("status", "pending")
      .lt("attempts", 3);

    const allJobIds = (allPendingJobs || []).map((j: { id: string }) => j.id);

    // ── Step 5: Trigger the pipeline worker for each pending job ─────
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    for (const jobId of allJobIds) {
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
    }

    const pendingRetried = allJobIds.length - jobIds.length;

    return NextResponse.json({
      success: true,
      calls_discovered: discoveredCalls.length,
      calls_new: newCalls.length,
      calls_duplicate: discoveredCalls.length - newCalls.length,
      jobs_created: jobsCreated,
      jobs_retried: pendingRetried > 0 ? pendingRetried : 0,
      message:
        jobsCreated > 0
          ? `Found ${newCalls.length} new call(s). Processing ${jobsCreated} call(s) in background...`
          : pendingRetried > 0
            ? `No new calls, but retrying ${pendingRetried} previously-pending job(s).`
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
