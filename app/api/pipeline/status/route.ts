/**
 * Pipeline Status — returns recent processing job statuses for the UI.
 * Authenticated by user session.
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const userSupabase = await createClient();
    const { data: { user } } = await userSupabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminSupabase = createAdminClient();
    const { data: userData } = await adminSupabase
      .from("users")
      .select("org_id")
      .eq("id", user.id)
      .single();

    if (!userData) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Get recent jobs
    const { data: jobs } = await adminSupabase
      .from("processing_jobs")
      .select("id, status, job_type, error_message, attempts, created_at, started_at, completed_at, payload")
      .eq("org_id", userData.org_id)
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
