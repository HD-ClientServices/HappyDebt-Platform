/**
 * POST /api/live-transfers/[id]/closing-status
 *
 * Change a live_transfer's `closing_status` from the UI AND propagate
 * the change to Go High Level so the next sync doesn't revert it.
 *
 * Body:
 *   { closing_status: "pending_to_close" | "closed_won" | "closed_lost" }
 *
 * Flow:
 *   1. Auth — any user with access to the live transfer's org can
 *      change the status (enforced via getEffectiveOrgId + org check).
 *   2. Load the row. If `ghl_closing_opportunity_id` is null (the lead
 *      hasn't hit the closing pipeline yet), reject with a friendly
 *      message pointing at "run a sync first".
 *   3. Load the global GHL credentials from the singleton.
 *   4. Map our status enum to GHL's status enum and PUT it against
 *      `/opportunities/{id}/status`. If GHL rejects, surface the error
 *      and do NOT update the local row — we don't want the UI and GHL
 *      to drift.
 *   5. On GHL success, update the local `live_transfers` row with the
 *      new status and bump `status_change_date` so dashboards filter
 *      it into the current period.
 *
 * `disqualified` is intentionally NOT accepted here — it's a closing
 * pipeline stage in GHL ("DQ Lead" or similar), not a status value.
 * The user has to move leads to/from the DQ stage in GHL directly.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEffectiveOrgId } from "@/lib/auth/getEffectiveOrgId";
import { GHLClient } from "@/lib/ghl/client";
import {
  getGHLGlobalConfig,
  GHLNotConfiguredError,
} from "@/lib/ghl/getGlobalConfig";

type ClosingStatus = "pending_to_close" | "closed_won" | "closed_lost";

// Map our internal closing_status enum to the GHL opportunity status
// enum. See `docs/skills/ghl-api/references/opportunities.md` for the
// valid GHL values.
const CLOSING_STATUS_TO_GHL_STATUS = {
  pending_to_close: "open",
  closed_won: "won",
  closed_lost: "lost",
} as const satisfies Record<ClosingStatus, "open" | "won" | "lost">;

function isValidClosingStatus(v: unknown): v is ClosingStatus {
  return (
    v === "pending_to_close" || v === "closed_won" || v === "closed_lost"
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 1. Auth
    const ctx = await getEffectiveOrgId(req);
    if (!ctx.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const orgId = ctx.effectiveOrgId;
    if (!orgId) {
      return NextResponse.json({ error: "No org context" }, { status: 400 });
    }

    const { id: liveTransferId } = await params;

    // 2. Parse + validate body
    const body = await req.json().catch(() => ({}));
    const newStatus = body.closing_status;

    if (!isValidClosingStatus(newStatus)) {
      return NextResponse.json(
        {
          error:
            "Invalid closing_status. Allowed values: pending_to_close, closed_won, closed_lost. 'disqualified' can only be set from GHL directly (it's a pipeline stage, not a status).",
        },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    // 3. Load the row (org-scoped)
    const { data: transfer, error: ltErr } = await admin
      .from("live_transfers")
      .select(
        "id, org_id, closing_status, ghl_closing_opportunity_id, ghl_contact_id, lead_name"
      )
      .eq("id", liveTransferId)
      .eq("org_id", orgId)
      .maybeSingle();

    if (ltErr || !transfer) {
      return NextResponse.json(
        { error: "Live transfer not found" },
        { status: 404 }
      );
    }

    if (!transfer.ghl_closing_opportunity_id) {
      return NextResponse.json(
        {
          error:
            "This lead has no closing opportunity linked yet. Run a sync first so the platform can associate it with its GHL closing pipeline opp.",
        },
        { status: 400 }
      );
    }

    // 4. Load GHL credentials
    let ghlConfig;
    try {
      ghlConfig = await getGHLGlobalConfig();
    } catch (err) {
      if (err instanceof GHLNotConfiguredError) {
        return NextResponse.json(
          {
            error:
              "GHL integration is not configured. Ask an Intro admin to set it up under Admin → GHL Integration.",
          },
          { status: 400 }
        );
      }
      throw err;
    }

    // 5. Push the change to GHL
    const ghlStatus = CLOSING_STATUS_TO_GHL_STATUS[newStatus];
    const ghl = new GHLClient(ghlConfig.apiToken, ghlConfig.locationId);

    try {
      await ghl.updateOpportunityStatus(
        transfer.ghl_closing_opportunity_id,
        ghlStatus
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[closing-status] GHL update failed for live_transfer ${liveTransferId}:`,
        message
      );
      return NextResponse.json(
        {
          error: `Failed to update status in GHL: ${message}. The local dashboard was NOT changed to keep it in sync with GHL.`,
        },
        { status: 502 }
      );
    }

    // 6. GHL accepted — update the local row. If this fails the DB and
    // GHL will drift until the next sync re-derives closing_status, but
    // that's self-healing within the next sync cycle.
    const nowIso = new Date().toISOString();
    const { error: updateErr } = await admin
      .from("live_transfers")
      .update({
        closing_status: newStatus,
        status_change_date: nowIso,
      })
      .eq("id", liveTransferId);

    if (updateErr) {
      console.error(
        `[closing-status] GHL was updated but local DB update failed for ${liveTransferId}:`,
        updateErr.message
      );
      return NextResponse.json(
        {
          success: false,
          error: `GHL was updated but the local dashboard failed to save: ${updateErr.message}. Next sync will re-derive the status from GHL.`,
        },
        { status: 500 }
      );
    }

    console.log(
      `[closing-status] ${transfer.lead_name || liveTransferId}: ${transfer.closing_status} → ${newStatus} (GHL opp ${transfer.ghl_closing_opportunity_id})`
    );

    return NextResponse.json({
      success: true,
      live_transfer_id: liveTransferId,
      closing_status: newStatus,
      ghl_opportunity_id: transfer.ghl_closing_opportunity_id,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[closing-status] Unexpected error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
