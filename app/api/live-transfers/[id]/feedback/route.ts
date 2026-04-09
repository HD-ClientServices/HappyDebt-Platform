/**
 * POST /api/live-transfers/[id]/feedback
 *
 * Body: { rating: 1-5, comment?: string | null }
 *
 * Inserts a feedback row in `live_transfer_feedback` linking the user
 * who is sending feedback, the live transfer, and the org. Used by the
 * client to give Intro feedback about each lead's quality.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEffectiveOrgId } from "@/lib/auth/getEffectiveOrgId";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getEffectiveOrgId(req);
    if (!ctx.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const orgId = ctx.effectiveOrgId;
    if (!orgId) {
      return NextResponse.json({ error: "No org context" }, { status: 400 });
    }

    const { id: liveTransferId } = await params;
    const body = await req.json().catch(() => ({}));
    const rating = Number(body?.rating);
    const comment =
      typeof body?.comment === "string" && body.comment.trim().length > 0
        ? body.comment.trim()
        : null;

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return NextResponse.json(
        { error: "rating must be an integer 1-5" },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    // Verify the live transfer belongs to the org
    const { data: transfer } = await admin
      .from("live_transfers")
      .select("id")
      .eq("id", liveTransferId)
      .eq("org_id", orgId)
      .maybeSingle();

    if (!transfer) {
      return NextResponse.json(
        { error: "Live transfer not found" },
        { status: 404 }
      );
    }

    const { data: feedback, error } = await admin
      .from("live_transfer_feedback")
      .insert({
        org_id: orgId,
        live_transfer_id: liveTransferId,
        user_id: ctx.userId,
        rating,
        comment,
      })
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, feedback_id: feedback.id });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
