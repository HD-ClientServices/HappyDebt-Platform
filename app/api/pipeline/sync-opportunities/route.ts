/**
 * Sync GHL Opportunities → live_transfers table.
 *
 * Strategy:
 * 1. Fetch opportunities from the configured "opening pipeline"
 * 2. Fetch each contact to read the {{contact.closer}} custom field
 * 3. Resolve closer name → closer DB record
 * 4. Batch upsert into live_transfers (never overwrite "funded" status)
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { GHLClient } from "@/lib/ghl/client";
import { findOrCreateCloser } from "@/lib/pipeline/closers";
import type { GHLOpportunity } from "@/lib/ghl/types";

export const maxDuration = 300;

const BATCH_SIZE = 50;

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

    // ── Step 2: Bulk fetch ALL contacts (paginated, ~10-20 requests) ──
    console.log("[sync-opps] Bulk fetching all contacts for closer field...");
    const contactMap = await ghl.getAllContacts();
    console.log(`[sync-opps] Fetched ${contactMap.size} total contacts`);

    // DEBUG: Log a sample contact's custom fields to verify field key
    if (contactMap.size > 0) {
      const sampleContact = [...contactMap.values()].find((c) => c.customFields?.length);
      if (sampleContact) {
        console.log(
          `[sync-opps] DEBUG sample contact custom fields:`,
          JSON.stringify(sampleContact.customFields?.slice(0, 5))
        );
        const closerField = GHLClient.extractCloserField(sampleContact);
        console.log(`[sync-opps] DEBUG extracted closer from sample: "${closerField}"`);
      } else {
        console.log(`[sync-opps] DEBUG no contacts found with customFields`);
      }
    }

    // Pre-resolve closer names → DB closer IDs (cache by name to avoid duplicates)
    const closerNameCache = new Map<string, string | null>();
    let closerResolved = 0;
    let closerMissing = 0;

    for (const opp of allOpps) {
      const contact = opp.contact?.id ? contactMap.get(opp.contact.id) : null;
      const closerName = contact ? GHLClient.extractCloserField(contact) : null;

      if (closerName) {
        if (!closerNameCache.has(closerName.toLowerCase())) {
          const closerId = await findOrCreateCloser(admin, org.id!, closerName);
          closerNameCache.set(closerName.toLowerCase(), closerId);
        }
        closerResolved++;
      } else {
        closerMissing++;
      }
    }
    console.log(
      `[sync-opps] Closers: ${closerResolved} resolved, ${closerMissing} missing, ${closerNameCache.size} unique names`
    );

    // ── Step 3: Fetch all existing live_transfers in one query ────────
    const ghlOppIds = allOpps.map((o) => o.id);
    const existingMap = new Map<
      string,
      { id: string; status: string }
    >();

    // Supabase .in() has a limit, fetch in chunks of 500
    for (let i = 0; i < ghlOppIds.length; i += 500) {
      const chunk = ghlOppIds.slice(i, i + 500);
      const { data: rows } = await admin
        .from("live_transfers")
        .select("id, status, ghl_opportunity_id")
        .in("ghl_opportunity_id", chunk);
      for (const row of rows ?? []) {
        existingMap.set(row.ghl_opportunity_id, {
          id: row.id,
          status: row.status,
        });
      }
    }
    console.log(`[sync-opps] Found ${existingMap.size} existing transfers in DB`);

    // ── Step 4: Batch upsert ─────────────────────────────────────────
    let inserted = 0;
    let updated = 0;
    let skippedFunded = 0;

    // Prepare all rows
    const toInsert: Record<string, unknown>[] = [];
    const toUpdateNormal: { id: string; data: Record<string, unknown> }[] = [];
    const toUpdateFunded: { id: string; data: Record<string, unknown> }[] = [];

    for (const opp of allOpps) {
      // Resolve closer from contact custom field
      const contact = opp.contact?.id ? contactMap.get(opp.contact.id) : null;
      const closerName = contact ? GHLClient.extractCloserField(contact) : null;
      const closerId = closerName
        ? closerNameCache.get(closerName.toLowerCase()) ?? null
        : null;

      const row = {
        org_id: org.id,
        closer_id: closerId,
        lead_name: opp.contact?.name || opp.name || "Unknown Lead",
        lead_phone: opp.contact?.phone || null,
        lead_email: opp.contact?.email || null,
        business_name: opp.contact?.companyName || null,
        transfer_date: opp.createdAt,
        status: "transferred",
        amount: opp.monetaryValue || 0,
        ghl_opportunity_id: opp.id,
      };

      const existing = existingMap.get(opp.id);
      if (existing) {
        if (existing.status === "funded") {
          // Don't overwrite funded status
          const { status: _, ...withoutStatus } = row;
          void _;
          toUpdateFunded.push({ id: existing.id, data: withoutStatus });
          skippedFunded++;
        } else {
          toUpdateNormal.push({ id: existing.id, data: row });
        }
        updated++;
      } else {
        toInsert.push(row);
        inserted++;
      }
    }

    // Batch insert new records
    for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
      const batch = toInsert.slice(i, i + BATCH_SIZE);
      const { error } = await admin.from("live_transfers").insert(batch);
      if (error) console.error(`[sync-opps] Insert batch error:`, error.message);
    }

    // Batch update existing records (non-funded)
    for (const item of toUpdateNormal) {
      await admin
        .from("live_transfers")
        .update(item.data)
        .eq("id", item.id);
    }

    // Batch update funded records (without status change)
    for (const item of toUpdateFunded) {
      await admin
        .from("live_transfers")
        .update(item.data)
        .eq("id", item.id);
    }

    console.log(
      `[sync-opps] Done: ${inserted} inserted, ${updated} updated, ${skippedFunded} funded-protected, ${closerNameCache.size} unique closers`
    );

    return NextResponse.json({
      success: true,
      total_fetched: allOpps.length,
      inserted,
      updated,
      skipped_funded: skippedFunded,
      closers_resolved: closerResolved,
      closers_missing: closerMissing,
      message:
        inserted > 0
          ? `Synced ${inserted} new transfer(s) and updated ${updated} existing. ${closerResolved} closers resolved.`
          : updated > 0
            ? `Updated ${updated} existing transfer(s). ${closerResolved} closers resolved.`
            : "No opportunities found in the opening pipeline.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[sync-opps] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
