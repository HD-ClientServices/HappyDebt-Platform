/**
 * Cron Job — daily safety net that retries pending / failed processing
 * jobs.
 *
 * ## Schedule
 *
 * Runs daily at 04:17 UTC. Vercel Hobby only allows daily crons, and
 * this job is a safety net — not the main processing path — so one
 * run per day is plenty. The 17-minute offset keeps us off the
 * every-minute edge where the entire Vercel fleet piles up.
 *
 * ## Why this exists
 *
 * Calls are processed inline from two places:
 *   1. `/api/webhooks/ghl-call` — fires a fetch to `/api/pipeline/process`
 *      immediately after queueing the job.
 *   2. `/api/pipeline/sync` — same fire-and-forget after batch-inserting
 *      jobs.
 *
 * If either of those inline triggers fails (network flake, cold start
 * timeout, pipeline worker crash) the job stays in `pending` with
 * `attempts = 0`. This cron finds those orphans and retries them
 * (`attempts` capped at 3). In practice it catches ~1% of jobs.
 *
 * ## GHL credentials
 *
 * After migration 00015 credentials live in the singleton
 * `ghl_integration` table. This route used to have a legacy fallback
 * to `process.env.GHL_API_TOKEN` / `GHL_LOCATION_ID`; that was removed
 * in migration 00016 — everything reads from the singleton now.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { processCall } from "@/lib/pipeline/process-call";
import {
  getGHLGlobalConfig,
  GHLNotConfiguredError,
} from "@/lib/ghl/getGlobalConfig";

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
    // ── Load global credentials once — fail fast if missing ─────
    let ghlToken = "";
    let ghlLocationId = "";
    try {
      const cfg = await getGHLGlobalConfig();
      ghlToken = cfg.apiToken;
      ghlLocationId = cfg.locationId;
    } catch (err) {
      if (err instanceof GHLNotConfiguredError) {
        console.warn("[cron] GHL integration not configured; skipping run.");
        return NextResponse.json({
          message: "GHL integration not configured",
          processed: 0,
        });
      }
      throw err;
    }

    // ── Find pending or retryable failed jobs ───────────────────
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

    console.log(
      `[cron] Processed ${processed}/${jobs.length} job(s) at ${new Date().toISOString()}`
    );

    return NextResponse.json({ processed, total: jobs.length, results });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[cron] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
