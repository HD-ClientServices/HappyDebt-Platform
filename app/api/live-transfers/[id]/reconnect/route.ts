/**
 * POST /api/live-transfers/[id]/reconnect
 *
 * Triggers a reconnect of the lead by POSTing to the org's configured
 * `ghl_reconnect_webhook_url`. The body matches the existing user's
 * Make.com Slack workflow exactly:
 *
 *   { "contactId": "<ghl_contact_id>", "source": "intro_platform_recontact" }
 *
 * Verified against the user's blueprint at
 * `Integration Webhooks.blueprint.json` (id 20 → http:MakeRequest module).
 *
 * Auth: any user with access to the org. The endpoint validates that the
 * live transfer belongs to the effective org (respects impersonation via
 * getEffectiveOrgId).
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEffectiveOrgId } from "@/lib/auth/getEffectiveOrgId";

const RECONNECT_TIMEOUT_MS = 10_000;

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

    const admin = createAdminClient();

    // 1. Load the live transfer (must belong to the org)
    const { data: transfer, error: ltErr } = await admin
      .from("live_transfers")
      .select("id, ghl_contact_id, lead_name")
      .eq("id", liveTransferId)
      .eq("org_id", orgId)
      .maybeSingle();

    if (ltErr || !transfer) {
      return NextResponse.json(
        { error: "Live transfer not found" },
        { status: 404 }
      );
    }

    if (!transfer.ghl_contact_id) {
      return NextResponse.json(
        {
          success: false,
          error: "Live transfer has no GHL contact id (run a sync first)",
        },
        { status: 400 }
      );
    }

    // 2. Load the org's reconnect webhook URL
    const { data: org } = await admin
      .from("organizations")
      .select("ghl_reconnect_webhook_url")
      .eq("id", orgId)
      .single();

    if (!org?.ghl_reconnect_webhook_url) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Reconnect webhook not configured for this organization. Ask an Intro admin to set it up.",
        },
        { status: 400 }
      );
    }

    // 3. POST to the webhook with the exact schema the user's Make.com
    //    workflow expects (verified against Integration Webhooks.blueprint.json)
    const payload = {
      contactId: transfer.ghl_contact_id,
      source: "intro_platform_recontact",
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), RECONNECT_TIMEOUT_MS);

    let webhookStatus = 0;
    let webhookOk = false;

    try {
      const res = await fetch(org.ghl_reconnect_webhook_url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      webhookStatus = res.status;
      webhookOk = res.ok;
    } catch (err) {
      const message =
        err instanceof Error && err.name === "AbortError"
          ? "Webhook timed out after 10s"
          : err instanceof Error
            ? err.message
            : String(err);
      return NextResponse.json(
        { success: false, error: `Webhook failed: ${message}` },
        { status: 502 }
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!webhookOk) {
      return NextResponse.json(
        {
          success: false,
          error: `Webhook returned ${webhookStatus}`,
          webhook_status: webhookStatus,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      webhook_status: webhookStatus,
      live_transfer_id: liveTransferId,
      contact_id: transfer.ghl_contact_id,
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
