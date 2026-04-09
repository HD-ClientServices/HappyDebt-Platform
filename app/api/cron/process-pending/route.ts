/**
 * Cron Job — daily maintenance: (1) refresh from GHL, then (2) retry
 * any pending / failed processing jobs.
 *
 * ## Schedule
 *
 * Runs daily at 04:17 UTC. Vercel Hobby only allows daily crons, and
 * everything the platform needs to do automatically happens inside
 * this single run. The 17-minute offset keeps us off the every-minute
 * edge where the entire Vercel fleet piles up.
 *
 * ## What it does
 *
 * 1. **Sync from GHL** — fires an internal POST to `/api/pipeline/sync`
 *    with the `CRON_SECRET` as Bearer auth. That pulls fresh
 *    opportunities from every configured org's opening + closing
 *    pipelines and upserts them into `live_transfers`. Without this
 *    step the dashboard would only refresh when a user clicked the
 *    Refresh button. Running this first means the dashboard is always
 *    current for the next morning.
 *
 * 2. **Retry stuck jobs** — finds any `processing_jobs` still in
 *    `pending` or `failed` (with < 3 attempts) and re-runs them
 *    through `processCall()`. This is the safety net for calls whose
 *    inline trigger failed from either:
 *      - `/api/webhooks/ghl-call` — fires a fetch to `/api/pipeline/process`
 *        immediately after queueing the job.
 *      - `/api/pipeline/sync` — same fire-and-forget after
 *        batch-inserting jobs (including the step-1 sync above).
 *    In practice step 2 catches ~1% of jobs.
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

    // ── Step 1: Run a full GHL → Supabase sync ──────────────────
    //
    // We fire an internal POST to `/api/pipeline/sync` with the same
    // CRON_SECRET we authenticated with. The sync route has a cron
    // bypass that accepts this header in lieu of a user session.
    //
    // Failures here are LOGGED but not fatal — we still want to run
    // step 2 so stuck jobs from the previous day don't get delayed
    // another 24 hours by a transient GHL hiccup.
    let syncSummary: string | null = null;
    let syncError: string | null = null;
    try {
      const baseUrl = process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

      const syncRes = await fetch(`${baseUrl}/api/pipeline/sync`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cronSecret ?? ""}`,
          "Content-Type": "application/json",
        },
      });

      if (syncRes.ok) {
        const body = (await syncRes.json()) as { message?: string };
        syncSummary = body.message ?? "Sync completed";
        console.log(`[cron] sync → ${syncSummary}`);
      } else {
        syncError = `sync returned ${syncRes.status}: ${await syncRes
          .text()
          .catch(() => "<unreadable body>")}`;
        console.warn(`[cron] ${syncError}`);
      }
    } catch (err) {
      syncError = err instanceof Error ? err.message : String(err);
      console.warn(`[cron] sync fetch threw: ${syncError}`);
    }

    // ── Find pending or retryable failed jobs ───────────────────
    const { data: jobs } = await supabase
      .from("processing_jobs")
      .select("*")
      .or("status.eq.pending,and(status.eq.failed,attempts.lt.3)")
      .order("created_at", { ascending: true })
      .limit(3);

    if (!jobs || jobs.length === 0) {
      return NextResponse.json({
        message: "No pending jobs",
        processed: 0,
        sync: syncSummary,
        sync_error: syncError,
      });
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

    return NextResponse.json({
      processed,
      total: jobs.length,
      results,
      sync: syncSummary,
      sync_error: syncError,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[cron] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
