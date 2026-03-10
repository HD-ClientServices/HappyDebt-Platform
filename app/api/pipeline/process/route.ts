/**
 * Pipeline Worker — processes pending call analysis jobs.
 * Called internally by the webhook handler, sync, or cron.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { processCall } from "@/lib/pipeline/process-call";

export const maxDuration = 60; // Vercel Pro: 60s timeout

export async function POST(req: NextRequest) {
  // Authenticate internal calls
  const secret = req.headers.get("x-pipeline-secret");
  if (secret !== process.env.PIPELINE_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  try {
    const body = await req.json().catch(() => ({}));
    const specificJobId = body.jobId;

    // Find job to process
    let query = supabase
      .from("processing_jobs")
      .select("*")
      .eq("status", "pending")
      .lt("attempts", 3)
      .order("created_at", { ascending: true })
      .limit(1);

    if (specificJobId) {
      query = supabase
        .from("processing_jobs")
        .select("*")
        .eq("id", specificJobId)
        .limit(1);
    }

    const { data: jobs, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!jobs || jobs.length === 0) {
      return NextResponse.json({ message: "No pending jobs" });
    }

    const job = jobs[0];

    // Increment attempts
    await supabase
      .from("processing_jobs")
      .update({ attempts: (job.attempts || 0) + 1 })
      .eq("id", job.id);

    // Get GHL credentials: first from org, then from payload, then from env
    const payload = job.payload as Record<string, string>;
    let ghlToken = "";
    let ghlLocationId = "";

    // Try to get credentials from the org
    if (job.org_id) {
      const { data: org } = await supabase
        .from("organizations")
        .select("ghl_api_token, ghl_location_id")
        .eq("id", job.org_id)
        .single();

      if (org) {
        ghlToken = org.ghl_api_token || "";
        ghlLocationId = org.ghl_location_id || "";
      }
    }

    // Fallback to payload or env
    if (!ghlToken) ghlToken = payload.ghl_token || process.env.GHL_API_TOKEN || "";
    if (!ghlLocationId) ghlLocationId = payload.ghl_location_id || process.env.GHL_LOCATION_ID || "";

    if (!ghlToken || !ghlLocationId) {
      await supabase
        .from("processing_jobs")
        .update({ status: "failed", error_message: "Missing GHL credentials" })
        .eq("id", job.id);
      return NextResponse.json({ error: "Missing GHL credentials" }, { status: 400 });
    }

    // Run the pipeline — pass all fields including pre-discovered IDs
    await processCall(
      {
        contact_id: payload.contact_id,
        contact_name: payload.contact_name || "Unknown",
        contact_phone: payload.contact_phone || "",
        call_duration: payload.call_duration || "0",
        business_name: payload.business_name || "",
        closer: payload.closer || "N/A",
        message_id: payload.message_id || undefined,
        conversation_id: payload.conversation_id || undefined,
        direction: payload.direction || undefined,
        call_date: payload.call_date || undefined,
      },
      {
        jobId: job.id,
        orgId: job.org_id,
        ghlToken,
        ghlLocationId,
        closerId: payload.closer_id || null,
      }
    );

    return NextResponse.json({ success: true, jobId: job.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[worker] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
