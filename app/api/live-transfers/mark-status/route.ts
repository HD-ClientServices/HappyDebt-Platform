/**
 * POST /api/live-transfers/mark-status — toggle a live_transfer's status
 * between `transferred` and `funded`. Used by LeadsOverviewTable.
 *
 * Body: { id: string, status: "transferred" | "funded" }
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEffectiveOrgId } from "@/lib/auth/getEffectiveOrgId";

const ALLOWED_STATUSES = new Set(["transferred", "funded"]);

export async function POST(req: NextRequest) {
  try {
    const ctx = await getEffectiveOrgId(req);
    if (!ctx.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const orgId = ctx.effectiveOrgId;
    if (!orgId) {
      return NextResponse.json({ error: "No org context" }, { status: 400 });
    }

    const body = await req.json();
    const { id, status } = body;

    if (!id) {
      return NextResponse.json({ error: "Missing live_transfer id" }, { status: 400 });
    }

    if (!ALLOWED_STATUSES.has(status)) {
      return NextResponse.json(
        { error: "status must be 'transferred' or 'funded'" },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    const { error } = await admin
      .from("live_transfers")
      .update({ status })
      .eq("id", id)
      .eq("org_id", orgId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
