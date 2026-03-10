/**
 * Cron Job — retries pending/failed processing jobs every 2 minutes.
 * Configured in vercel.json.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { processCall } from "@/lib/pipeline/process-call";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  // Verify cron secret (Vercel sets CRON_SECRET automatically)
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  try {
    // Find pending or retryable failed jobs
    const { data: jobs } = await supabase
      .from("processing_jobs")
      .select("*")
      .or("status.eq.pending,and(status.eq.failed,attempts.lt.3)")
      .order("created_at", { ascending: true })
      .limit(3);

    if (!jobs || jobs.length === 0) {
      return NextResponse.json({ message: "No pending jobs", processed: 0 });
    }

    let processed = 0;
    const results: { jobId: string; success: boolean; error?: string }[] = [];

    for (const job of jobs) {
      try {
        // Increment attempts
        await supabase
          .from("processing_jobs")
          .update({ attempts: (job.attempts || 0) + 1 })
          .eq("id", job.id);

        const payload = job.payload as Record<string, string>;
        const ghlToken = payload.ghl_token || process.env.GHL_API_TOKEN || "";
        const ghlLocationId = payload.ghl_location_id || process.env.GHL_LOCATION_ID || "";

        if (!ghlToken || !ghlLocationId) {
          await supabase
            .from("processing_jobs")
            .update({ status: "failed", error_message: "Missing GHL credentials" })
            .eq("id", job.id);
          results.push({ jobId: job.id, success: false, error: "Missing GHL credentials" });
          continue;
        }

        await processCall(
          {
            contact_id: payload.contact_id,
            contact_name: payload.contact_name || "Unknown",
            contact_phone: payload.contact_phone || "",
            call_duration: payload.call_duration || "0",
            business_name: payload.business_name || "",
            closer: payload.closer || "N/A",
          },
          {
            jobId: job.id,
            orgId: job.org_id,
            ghlToken,
            ghlLocationId,
            closerId: payload.closer_id || null,
          }
        );

        processed++;
        results.push({ jobId: job.id, success: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        results.push({ jobId: job.id, success: false, error: message });
      }
    }

    return NextResponse.json({ processed, total: jobs.length, results });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
