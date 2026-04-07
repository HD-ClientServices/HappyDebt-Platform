/**
 * POST /api/leads/mark-status — toggle a lead's status between
 * `transferred` and `closed_won`. Used by the LeadsOverviewTable
 * "Mark Closed Won / Undo" button.
 *
 * Body: { id: string, status: "transferred" | "closed_won" }
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEffectiveOrgId } from "@/lib/auth/getEffectiveOrgId";

const ALLOWED_STATUSES = new Set(["transferred", "closed_won"]);

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
      return NextResponse.json({ error: "Missing lead id" }, { status: 400 });
    }

    if (!ALLOWED_STATUSES.has(status)) {
      return NextResponse.json(
        { error: "status must be 'transferred' or 'closed_won'" },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    const updates: Record<string, unknown> = { status };
    if (status === "closed_won") {
      updates.closed_date = new Date().toISOString();
    } else {
      updates.closed_date = null;
    }

    const { error } = await admin
      .from("leads")
      .update(updates)
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
