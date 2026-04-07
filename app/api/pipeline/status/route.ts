/**
 * Pipeline Status — returns recent processing job statuses for the UI.
 * Authenticated by user session, respects admin impersonation.
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
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

    const adminSupabase = createAdminClient();

    // Get recent jobs
    const { data: jobs } = await adminSupabase
      .from("processing_jobs")
      .select("id, status, job_type, error_message, attempts, created_at, started_at, completed_at, payload")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(20);

    // Summary counts
    const pending = (jobs || []).filter((j) => j.status === "pending").length;
    const processing = (jobs || []).filter((j) => j.status === "processing").length;
    const completed = (jobs || []).filter((j) => j.status === "completed").length;
    const failed = (jobs || []).filter((j) => j.status === "failed").length;

    return NextResponse.json({
      jobs: jobs || [],
      summary: { pending, processing, completed, failed },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
