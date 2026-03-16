/**
 * Sync GHL Opportunities → live_transfers table.
 *
 * Strategy:
 * 1. Fetch opportunities from the configured "opening pipeline"
 * 2. Map: GHL WON → "transferred", GHL lost → "declined"
 * 3. Resolve closer from {{contact.closer}} custom field
 * 4. Upsert into live_transfers (never overwrite "funded" status)
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { GHLClient } from "@/lib/ghl/client";
import { findOrCreateCloser } from "@/lib/pipeline/closers";
import type { GHLContact, GHLOpportunity } from "@/lib/ghl/types";

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const requestPipelineId = body.pipelineId as string | undefined;

    // Authenticate
    const userSupabase = await createClient();
    const {
      data: { user },
    } = await userSupabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: userData } = await admin
      .from("users")
      .select("org_id")
      .eq("id", user.id)
      .single();

    if (!userData) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Try with pipeline column, fall back without it
    let org: Record<string, string | null> | null = null;
    const { data: orgFull } = await admin
      .from("organizations")
      .select("id, ghl_api_token, ghl_location_id, ghl_opening_pipeline_id")
      .eq("id", userData.org_id)
      .single();

    if (orgFull) {
      org = orgFull;
    } else {
      // Pipeline column may not exist yet — fetch without it
      const { data: orgBasic } = await admin
        .from("organizations")
        .select("id, ghl_api_token, ghl_location_id")
        .eq("id", userData.org_id)
        .single();
      if (orgBasic) {
        org = { ...orgBasic, ghl_opening_pipeline_id: null };
      }
    }

    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    const ghlToken = org.ghl_api_token || process.env.GHL_API_TOKEN;
    const ghlLocationId = org.ghl_location_id || process.env.GHL_LOCATION_ID;

    if (!ghlToken || !ghlLocationId) {
      return NextResponse.json(
        { error: "GHL credentials not configured. Go to Settings to add them." },
        { status: 400 }
      );
    }

    const pipelineId = requestPipelineId || org.ghl_opening_pipeline_id;
    if (!pipelineId) {
      return NextResponse.json(
        { error: "Opening pipeline not configured. Select it in Settings → GHL Integration." },
        { status: 400 }
      );
    }

    const ghl = new GHLClient(ghlToken, ghlLocationId);

    // ── Step 1: Fetch all opportunities from the opening pipeline ────
    console.log("[sync-opps] Fetching opportunities from opening pipeline...");
    const allOpps: GHLOpportunity[] = [];
    let hasMore = true;
    let startAfter: number | undefined;
    let startAfterId: string | undefined;

    while (hasMore) {
      const data = await ghl.searchOpportunities(
        pipelineId,
        startAfter,
        startAfterId
      );
      const opps = data.opportunities || [];
      if (opps.length === 0) break;

      allOpps.push(...opps);

      const meta = data.meta;
      if (meta?.nextPageUrl && meta?.startAfter !== undefined && meta?.startAfterId) {
        startAfter = meta.startAfter;
        startAfterId = meta.startAfterId;
      } else {
        hasMore = false;
      }
    }

    console.log(`[sync-opps] Found ${allOpps.length} total opportunities`);

    // ── Step 2: Filter to won/lost only ──────────────────────────────
    const relevantOpps = allOpps.filter(
      (opp) => opp.status === "won" || opp.status === "lost"
    );
    console.log(`[sync-opps] ${relevantOpps.length} won/lost opportunities to sync`);

    // ── Step 3: Upsert into live_transfers ───────────────────────────
    const contactCache = new Map<string, GHLContact | null>();
    let inserted = 0;
    let updated = 0;
    let skippedFunded = 0;

    for (const opp of relevantOpps) {
      // Status mapping: GHL WON = transferred, GHL lost = declined
      const mappedStatus = opp.status === "won" ? "transferred" : "declined";

      // Resolve closer from {{contact.closer}}
      let closerId: string | null = null;
      const contactId = opp.contact?.id;
      if (contactId) {
        if (!contactCache.has(contactId)) {
          try {
            const contact = await ghl.getContact(contactId);
            contactCache.set(contactId, contact);
          } catch {
            contactCache.set(contactId, null);
          }
        }
        const cached = contactCache.get(contactId);
        if (cached) {
          const closerName = GHLClient.extractCloserField(cached);
          if (closerName) {
            closerId = await findOrCreateCloser(admin, org.id, closerName);
          }
        }
      }

      const oppData = {
        org_id: org.id,
        closer_id: closerId,
        lead_name: opp.contact?.name || opp.name || "Unknown Lead",
        lead_phone: opp.contact?.phone || null,
        lead_email: opp.contact?.email || null,
        business_name: opp.contact?.companyName || null,
        transfer_date: opp.createdAt,
        status: mappedStatus,
        amount: opp.monetaryValue || 0,
        ghl_opportunity_id: opp.id,
      };

      // Check if this opportunity already exists
      const { data: existing } = await admin
        .from("live_transfers")
        .select("id, status")
        .eq("ghl_opportunity_id", opp.id)
        .maybeSingle();

      if (existing) {
        // Never overwrite "funded" status (manually set by Rise)
        if (existing.status === "funded") {
          const { status: _, ...updateWithoutStatus } = oppData;
          void _;
          await admin
            .from("live_transfers")
            .update(updateWithoutStatus)
            .eq("id", existing.id);
          skippedFunded++;
        } else {
          await admin
            .from("live_transfers")
            .update(oppData)
            .eq("id", existing.id);
        }
        updated++;
      } else {
        await admin.from("live_transfers").insert(oppData);
        inserted++;
      }
    }

    console.log(
      `[sync-opps] Done: ${inserted} inserted, ${updated} updated, ${skippedFunded} funded-protected`
    );

    return NextResponse.json({
      success: true,
      total_fetched: allOpps.length,
      relevant: relevantOpps.length,
      inserted,
      updated,
      skipped_funded: skippedFunded,
      message:
        inserted > 0
          ? `Synced ${inserted} new transfer(s) and updated ${updated} existing.`
          : updated > 0
            ? `Updated ${updated} existing transfer(s). No new ones found.`
            : "No won/lost opportunities found in the opening pipeline.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[sync-opps] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
