/**
 * Manual Sync — discovers recent calls from GHL and queues them for processing.
 * Also syncs "Opening Pipeline" won opportunities as live_transfers.
 *
 * Optimized: uses batched DB operations and parallel GHL API calls.
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { GHLClient } from "@/lib/ghl/client";

export const maxDuration = 60;

export async function POST() {
  const t0 = Date.now();
  try {
    const userSupabase = await createClient();
    const {
      data: { user },
    } = await userSupabase.auth.getUser();

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

    const { data: org } = await adminSupabase
      .from("organizations")
      .select("id, ghl_api_token, ghl_location_id")
      .eq("id", userData.org_id)
      .single();

    if (!org) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    const ghlToken = org.ghl_api_token || process.env.GHL_API_TOKEN;
    const ghlLocationId = org.ghl_location_id || process.env.GHL_LOCATION_ID;

    if (!ghlToken || !ghlLocationId) {
      return NextResponse.json(
        { error: "GHL credentials not configured. Go to Settings to add them." },
        { status: 400 }
      );
    }

    const ghl = new GHLClient(ghlToken, ghlLocationId);

    // ── Step 1: Sync GHL users as closers (batched) ───────────────
    const ghlUsers = await ghl.getUsers();
    const activeUsers = ghlUsers.filter((u) => !u.deleted);

    // Fetch all existing closers in one query
    const { data: existingClosers } = await adminSupabase
      .from("closers")
      .select("id, ghl_user_id")
      .eq("org_id", org.id);

    const existingByGhlId = new Map(
      (existingClosers || []).map((c) => [c.ghl_user_id, c.id])
    );

    const closerMap = new Map<string, string>();
    const newClosers = [];

    for (const u of activeUsers) {
      const existingId = existingByGhlId.get(u.id);
      if (existingId) {
        closerMap.set(u.id, existingId);
      } else {
        newClosers.push({
          org_id: org.id,
          ghl_user_id: u.id,
          name: u.name,
          email: u.email,
          phone: u.phone,
          avatar_url: u.profilePhoto || null,
          active: true,
        });
      }
    }

    let closersSynced = 0;
    if (newClosers.length > 0) {
      const { data: inserted } = await adminSupabase
        .from("closers")
        .insert(newClosers)
        .select("id, ghl_user_id");
      (inserted || []).forEach((c) => closerMap.set(c.ghl_user_id, c.id));
      closersSynced = inserted?.length ?? 0;
    }

    // ── Run Steps 2-3 (calls) and Step 6 (opportunities) in PARALLEL ──
    const [callsResult, oppsResult] = await Promise.all([
      syncCalls(ghl, adminSupabase, org.id, closerMap),
      syncOpportunities(ghl, adminSupabase, org.id, closerMap),
    ]);

    // ── Step 5: Trigger pipeline workers (fire-and-forget) ────────
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    for (const jobId of callsResult.jobIds) {
      fetch(`${baseUrl}/api/pipeline/process`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-pipeline-secret": process.env.PIPELINE_SECRET || "",
        },
        body: JSON.stringify({ jobId }),
      }).catch(() => {});
    }

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`[sync] Done in ${elapsed}s — ${closersSynced} closers, ${callsResult.jobsCreated} calls, ${oppsResult.transfersSynced} transfers`);

    return NextResponse.json({
      success: true,
      closers_synced: closersSynced,
      calls_discovered: callsResult.discovered,
      calls_new: callsResult.newCalls,
      calls_duplicate: callsResult.discovered - callsResult.newCalls,
      jobs_created: callsResult.jobsCreated,
      transfers_synced: oppsResult.transfersSynced,
      pipeline_warning: oppsResult.warning,
      elapsed_seconds: elapsed,
      message:
        oppsResult.warning
          ? `Synced ${callsResult.jobsCreated} call(s). ⚠️ ${oppsResult.warning}`
          : `Synced ${oppsResult.transfersSynced} funded transfer(s) and queued ${callsResult.jobsCreated} call(s) for analysis. (${elapsed}s)`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[sync] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ── Calls sync (Steps 2-4) ────────────────────────────────────────
async function syncCalls(
  ghl: GHLClient,
  adminSupabase: ReturnType<typeof createAdminClient>,
  orgId: string,
  closerMap: Map<string, string>
) {
  console.log("[sync] Discovering recent calls from GHL...");
  const discoveredCalls = await ghl.discoverRecentCalls(100);
  console.log(`[sync] Found ${discoveredCalls.length} completed call(s)`);

  // Dedup — single query
  const { data: existingRecordings } = await adminSupabase
    .from("call_recordings")
    .select("ghl_message_id, ghl_conversation_id")
    .eq("org_id", orgId);

  const existingMessageIds = new Set(
    (existingRecordings || []).map((r: { ghl_message_id: string | null }) => r.ghl_message_id).filter(Boolean)
  );
  const existingConvIds = new Set(
    (existingRecordings || []).map((r: { ghl_conversation_id: string | null }) => r.ghl_conversation_id).filter(Boolean)
  );

  const newCalls = discoveredCalls.filter(
    (call) => !existingMessageIds.has(call.messageId) && !existingConvIds.has(call.conversationId)
  );

  console.log(`[sync] ${newCalls.length} new call(s) after dedup`);

  // ── Resolve or create leads for each call by ghl_contact_id ──────
  const contactIds = [...new Set(newCalls.map((c) => c.contactId).filter(Boolean))];
  const leadByContactId = new Map<string, string>();

  if (contactIds.length > 0) {
    // Fetch existing leads for these contacts in one query
    const { data: existingLeads } = await adminSupabase
      .from("leads")
      .select("id, ghl_contact_id")
      .eq("org_id", orgId)
      .in("ghl_contact_id", contactIds);

    for (const lead of existingLeads || []) {
      if (lead.ghl_contact_id) leadByContactId.set(lead.ghl_contact_id, lead.id);
    }

    // Create missing leads
    const missingContactIds = contactIds.filter((cid) => !leadByContactId.has(cid));
    if (missingContactIds.length > 0) {
      // Build a lookup from contactId → call info for name/phone
      const callInfoByContactId = new Map(
        newCalls.filter((c) => c.contactId).map((c) => [c.contactId, c])
      );

      const newLeadRows = missingContactIds.map((cid) => {
        const callInfo = callInfoByContactId.get(cid);
        return {
          org_id: orgId,
          name: callInfo?.contactName || "Unknown",
          phone: callInfo?.contactPhone || null,
          source: "ghl_sync" as const,
          status: "in_sequence" as const,
          ghl_contact_id: cid,
        };
      });

      for (let i = 0; i < newLeadRows.length; i += 50) {
        const chunk = newLeadRows.slice(i, i + 50);
        const { data: inserted, error } = await adminSupabase
          .from("leads")
          .insert(chunk)
          .select("id, ghl_contact_id");
        if (error) {
          console.error("[sync] Lead creation error:", error.message);
        } else {
          for (const lead of inserted || []) {
            if (lead.ghl_contact_id) leadByContactId.set(lead.ghl_contact_id, lead.id);
          }
        }
      }
      console.log(`[sync] Created ${missingContactIds.length} new lead(s) for calls`);
    }
  }

  // Batch insert processing jobs
  const jobIds: string[] = [];
  if (newCalls.length > 0) {
    const jobRows = newCalls.map((call) => ({
      org_id: orgId,
      status: "pending",
      job_type: "call_qa",
      payload: {
        contact_id: call.contactId,
        contact_name: call.contactName,
        contact_phone: call.contactPhone,
        call_duration: call.duration,
        business_name: "",
        closer: "",
        message_id: call.messageId,
        conversation_id: call.conversationId,
        direction: call.direction,
        call_date: call.callDate,
        lead_id: call.contactId ? leadByContactId.get(call.contactId) || null : null,
      },
      attempts: 0,
      max_attempts: 3,
    }));

    // Insert in chunks of 50 to avoid payload limits
    for (let i = 0; i < jobRows.length; i += 50) {
      const chunk = jobRows.slice(i, i + 50);
      const { data: inserted, error } = await adminSupabase
        .from("processing_jobs")
        .insert(chunk)
        .select("id");

      if (error) {
        console.error("[sync] Batch job insert error:", error.message);
      } else {
        (inserted || []).forEach((j) => jobIds.push(j.id));
      }
    }
  }

  return {
    discovered: discoveredCalls.length,
    newCalls: newCalls.length,
    jobsCreated: jobIds.length,
    jobIds,
  };
}

// ── Opportunities sync (Step 6) ───────────────────────────────────
async function syncOpportunities(
  ghl: GHLClient,
  adminSupabase: ReturnType<typeof createAdminClient>,
  orgId: string,
  closerMap: Map<string, string>
) {
  const pipelines = await ghl.getPipelines();
  const openingPipeline = pipelines.find(
    (p) => p.name.toLowerCase().includes("opening")
  );

  if (!openingPipeline) {
    const warning = `No pipeline matching "Opening Pipeline" found. Available: ${pipelines.map((p) => p.name).join(", ") || "none"}.`;
    console.warn(`[sync] ${warning}`);
    return { transfersSynced: 0, warning };
  }

  console.log(`[sync] Found Opening Pipeline: "${openingPipeline.name}" (${openingPipeline.id})`);

  // Fetch all won opps from Opening Pipeline
  const allOpps = [];
  let hasMore = true;
  let startAfter: string | undefined;
  let startAfterId: string | undefined;

  while (hasMore) {
    try {
      const oppData = await ghl.searchOpportunities(openingPipeline.id, {
        status: "won",
        startAfter,
        startAfterId,
      });
      const opps = (oppData.opportunities || []).filter((o) => o.status === "won");
      allOpps.push(...opps);

      const meta = oppData.meta;
      if (meta?.nextPageUrl && meta.startAfter && meta.startAfterId) {
        startAfter = meta.startAfter;
        startAfterId = meta.startAfterId;
      } else {
        hasMore = false;
      }
    } catch (err) {
      console.warn("[sync] Opportunities fetch error:", err instanceof Error ? err.message : String(err));
      hasMore = false;
    }
  }

  console.log(`[sync] Found ${allOpps.length} won opportunities`);

  if (allOpps.length === 0) {
    return { transfersSynced: 0, warning: null };
  }

  // Fetch existing transfers in one query for fast dedup
  const { data: existingTransfers } = await adminSupabase
    .from("live_transfers")
    .select("id, ghl_opportunity_id")
    .eq("org_id", orgId)
    .not("ghl_opportunity_id", "is", null);

  const existingByOppId = new Map(
    (existingTransfers || []).map((t) => [t.ghl_opportunity_id, t.id])
  );

  const syncedOppIds = new Set<string>();
  const toInsert = [];
  const toUpdate: { id: string; data: Record<string, unknown> }[] = [];

  for (const opp of allOpps) {
    syncedOppIds.add(opp.id);
    const closerId = opp.assignedTo ? closerMap.get(opp.assignedTo) || null : null;

    const transferData = {
      org_id: orgId,
      closer_id: closerId,
      lead_name: opp.contact?.name || opp.name || "Unknown Lead",
      lead_phone: opp.contact?.phone || null,
      lead_email: opp.contact?.email || null,
      business_name: opp.contact?.companyName || null,
      transfer_date: opp.createdAt,
      status: "funded",
      amount: opp.monetaryValue || 0,
      ghl_opportunity_id: opp.id,
    };

    const existingId = existingByOppId.get(opp.id);
    if (existingId) {
      toUpdate.push({ id: existingId, data: transferData });
    } else {
      toInsert.push(transferData);
    }
  }

  // Batch insert new transfers
  if (toInsert.length > 0) {
    for (let i = 0; i < toInsert.length; i += 50) {
      const chunk = toInsert.slice(i, i + 50);
      const { error } = await adminSupabase.from("live_transfers").insert(chunk);
      if (error) console.error("[sync] Batch transfer insert error:", error.message);
    }
  }

  // Batch update existing (Supabase doesn't support bulk update, but we can parallelize)
  if (toUpdate.length > 0) {
    const updateBatchSize = 10;
    for (let i = 0; i < toUpdate.length; i += updateBatchSize) {
      const batch = toUpdate.slice(i, i + updateBatchSize);
      await Promise.all(
        batch.map((item) =>
          adminSupabase.from("live_transfers").update(item.data).eq("id", item.id)
        )
      );
    }
  }

  // Clean up stale transfers
  const staleIds = (existingTransfers || [])
    .filter((t) => t.ghl_opportunity_id && !syncedOppIds.has(t.ghl_opportunity_id))
    .map((t) => t.id);

  if (staleIds.length > 0) {
    await adminSupabase.from("live_transfers").delete().in("id", staleIds);
    console.log(`[sync] Cleaned up ${staleIds.length} stale live_transfers`);
  }

  const transfersSynced = toInsert.length + toUpdate.length;
  console.log(`[sync] Synced ${transfersSynced} transfers (${toInsert.length} new, ${toUpdate.length} updated)`);

  // ── Dual-write: upsert into leads table ──────────────────────────
  let leadsSynced = 0;
  try {
    // Fetch existing leads by ghl_opportunity_id for dedup
    const oppIds = allOpps.map((o) => o.id);
    const { data: existingLeads } = await adminSupabase
      .from("leads")
      .select("id, ghl_opportunity_id")
      .eq("org_id", orgId)
      .in("ghl_opportunity_id", oppIds);

    const existingLeadByOppId = new Map(
      (existingLeads || []).map((l: { ghl_opportunity_id: string; id: string }) => [l.ghl_opportunity_id, l.id])
    );

    const leadsToInsert = [];
    const leadsToUpdate: { id: string; data: Record<string, unknown> }[] = [];

    for (const opp of allOpps) {
      const closerId = opp.assignedTo ? closerMap.get(opp.assignedTo) || null : null;

      const leadData = {
        org_id: orgId,
        closer_id: closerId,
        name: opp.contact?.name || opp.name || "Unknown Lead",
        phone: opp.contact?.phone || null,
        email: opp.contact?.email || null,
        business_name: opp.contact?.companyName || null,
        source: "ghl_sync" as const,
        ghl_contact_id: opp.contact?.id || null,
        ghl_opportunity_id: opp.id,
        status: "closed_won" as const, // won opps → closed_won in leads
        amount: opp.monetaryValue || 0,
        transfer_date: opp.createdAt,
        closed_date: opp.lastStatusChangeAt || opp.updatedAt || opp.createdAt,
      };

      const existingLeadId = existingLeadByOppId.get(opp.id);
      if (existingLeadId) {
        leadsToUpdate.push({ id: existingLeadId, data: leadData });
      } else {
        leadsToInsert.push(leadData);
      }
    }

    // Batch insert new leads
    if (leadsToInsert.length > 0) {
      for (let i = 0; i < leadsToInsert.length; i += 50) {
        const chunk = leadsToInsert.slice(i, i + 50);
        const { error } = await adminSupabase.from("leads").insert(chunk);
        if (error) console.error("[sync] Batch lead insert error:", error.message);
      }
    }

    // Batch update existing leads
    if (leadsToUpdate.length > 0) {
      const updateBatchSize = 10;
      for (let i = 0; i < leadsToUpdate.length; i += updateBatchSize) {
        const batch = leadsToUpdate.slice(i, i + updateBatchSize);
        await Promise.all(
          batch.map((item) =>
            adminSupabase.from("leads").update(item.data).eq("id", item.id)
          )
        );
      }
    }

    leadsSynced = leadsToInsert.length + leadsToUpdate.length;
    console.log(`[sync] Leads dual-write: ${leadsSynced} synced (${leadsToInsert.length} new, ${leadsToUpdate.length} updated)`);
  } catch (err) {
    console.error("[sync] Leads dual-write error (non-fatal):", err instanceof Error ? err.message : String(err));
  }

  return { transfersSynced, leadsSynced, warning: null };
}
