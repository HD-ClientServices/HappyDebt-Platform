/**
 * Pipeline Retry — triggers the worker for all pending jobs.
 * Fires requests in parallel batches to avoid timeout.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-pipeline-secret");
  if (secret !== process.env.PIPELINE_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  const { data: pendingJobs, error } = await supabase
    .from("processing_jobs")
    .select("id")
    .eq("status", "pending")
    .lt("attempts", 3)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!pendingJobs || pendingJobs.length === 0) {
    return NextResponse.json({ message: "No pending jobs to retry" });
  }

  // Fire-and-forget worker calls for each pending job
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  let triggered = 0;
  for (const job of pendingJobs) {
    fetch(`${baseUrl}/api/pipeline/process`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-pipeline-secret": process.env.PIPELINE_SECRET || "",
      },
      body: JSON.stringify({ jobId: job.id }),
    }).catch((err) => {
      console.warn(`[retry] Failed to trigger job ${job.id}:`, err);
    });
    triggered++;
  }

  return NextResponse.json({
    success: true,
    pending_jobs: pendingJobs.length,
    triggered,
    message: `Triggered ${triggered} pending job(s) for processing.`,
  });
}
