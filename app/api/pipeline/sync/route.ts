/**
 * Manual Sync — discovers recent calls from GHL and queues them for processing.
 * Also syncs "Opening Pipeline" won opportunities as live_transfers.
 *
 * Optimized: uses batched DB operations and parallel GHL API calls.
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { GHLClient } from "@/lib/ghl/client";
import { getEffectiveOrgId } from "@/lib/auth/getEffectiveOrgId";
import {
  getGHLGlobalConfig,
  GHLNotConfiguredError,
} from "@/lib/ghl/getGlobalConfig";

export const maxDuration = 60;

export async function POST(request: Request) {
  const t0 = Date.now();
  try {
    const ctx = await getEffectiveOrgId(request);
    if (!ctx.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const effectiveOrgId = ctx.effectiveOrgId;
    if (!effectiveOrgId) {
      return NextResponse.json({ error: "No org context" }, { status: 400 });
    }

    const adminSupabase = createAdminClient();

    // Live transfers still belong to a specific org (they're per-tenant
    // data), but the GHL credentials and pipeline IDs are global — the
    // entire product talks to a single GHL account. Migration 00015
    // moved those columns out of `organizations` into the singleton
    // `ghl_integration` table; everything below reads them from there.
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

    // Confirm the requested org actually exists before doing anything
    // expensive. (We don't need any of its columns — just its id.)
    const { data: org } = await adminSupabase
      .from("organizations")
      .select("id")
      .eq("id", effectiveOrgId)
      .single();

    if (!org) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    const ghl = new GHLClient(ghlConfig.apiToken, ghlConfig.locationId);

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
      syncOpportunities(
        ghl,
        adminSupabase,
        org.id,
        closerMap,
        ghlConfig.openingPipelineId,
        ghlConfig.closingPipelineId
      ),
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
  closerMap: Map<string, string>,
  configuredOpeningPipelineId: string | null,
  configuredClosingPipelineId: string | null
) {
  const pipelines = await ghl.getPipelines();

  // ── Resolve opening pipeline (configured ID > name fallback) ──
  const openingPipeline = configuredOpeningPipelineId
    ? pipelines.find((p) => p.id === configuredOpeningPipelineId)
    : pipelines.find((p) => p.name.toLowerCase().includes("opening"));

  if (!openingPipeline) {
    const warning = configuredOpeningPipelineId
      ? `Configured opening pipeline (id=${configuredOpeningPipelineId}) not found in GHL. Available: ${pipelines.map((p) => p.name).join(", ") || "none"}.`
      : `No pipeline matching "Opening Pipeline" found. Available: ${pipelines.map((p) => p.name).join(", ") || "none"}.`;
    console.warn(`[sync] ${warning}`);
    return { transfersSynced: 0, warning };
  }

  // ── Resolve closing pipeline (optional, configured ID > name fallback) ──
  const closingPipeline = configuredClosingPipelineId
    ? pipelines.find((p) => p.id === configuredClosingPipelineId)
    : pipelines.find((p) => p.name.toLowerCase().includes("closing"));

  console.log(
    `[sync] Opening: "${openingPipeline.name}" (${openingPipeline.id})` +
      (closingPipeline
        ? ` | Closing: "${closingPipeline.name}" (${closingPipeline.id})`
        : " | No closing pipeline configured")
  );

  // Build a stage-id → name map for the closing pipeline (used to detect DQ Lead)
  const closingStageNameById = new Map<string, string>();
  if (closingPipeline) {
    for (const s of closingPipeline.stages) {
      closingStageNameById.set(s.id, s.name);
    }
  }

  // ── Fetch all WON opps from Opening Pipeline (paginated) ──
  let openingWonOpps: Awaited<
    ReturnType<typeof ghl.getAllOpportunities>
  > = [];
  try {
    openingWonOpps = await ghl.getAllOpportunities(openingPipeline.id, {
      status: "won",
    });
  } catch (err) {
    console.warn(
      "[sync] Opening pipeline fetch error:",
      err instanceof Error ? err.message : String(err)
    );
  }

  // ── Fetch ALL opps from Closing Pipeline (any status) for matching ──
  let closingOpps: Awaited<ReturnType<typeof ghl.getAllOpportunities>> = [];
  if (closingPipeline) {
    try {
      closingOpps = await ghl.getAllOpportunities(closingPipeline.id);
    } catch (err) {
      console.warn(
        "[sync] Closing pipeline fetch error:",
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  console.log(
    `[sync] Found ${openingWonOpps.length} won opps in opening, ${closingOpps.length} in closing`
  );

  if (openingWonOpps.length === 0) {
    return { transfersSynced: 0, warning: null };
  }

  // Build closing-by-contactId map for fast cross-pipeline matching
  const closingByContactId = new Map<
    string,
    (typeof closingOpps)[number]
  >();
  for (const opp of closingOpps) {
    const cid = opp.contactId ?? opp.contact?.id;
    if (cid) closingByContactId.set(cid, opp);
  }

  // ── Build the full set of rows to upsert ──────────────────────────
  // Strategy: build every row from the GHL won-opps list, then UPSERT
  // on `ghl_opportunity_id` (which is UNIQUE in the DB). This removes
  // the need to pre-fetch existing transfers — PostgreSQL handles the
  // insert-or-update decision atomically, which also eliminates the
  // duplicate-key errors that appeared when the sync ran in parallel
  // (auto-sync + manual sync, or StrictMode double-mount).
  const syncedOppIds = new Set<string>();
  const rows: Record<string, unknown>[] = [];

  for (const opp of openingWonOpps) {
    syncedOppIds.add(opp.id);
    const closerId = opp.assignedTo
      ? closerMap.get(opp.assignedTo) || null
      : null;
    const contactId = opp.contactId ?? opp.contact?.id ?? null;

    // Determine closing_status by looking up the closing pipeline opp
    const closing = contactId ? closingByContactId.get(contactId) : null;
    let closingStatus: string = "pending_to_close";
    let closingStatusChangedAt: string | undefined;

    if (closing) {
      if (closing.status === "won") {
        closingStatus = "closed_won";
      } else if (closing.status === "lost") {
        closingStatus = "closed_lost";
      } else {
        // status is open/abandoned — check stage for DQ Lead
        const stageName = closing.pipelineStageId
          ? (closingStageNameById.get(closing.pipelineStageId) ?? "")
          : "";
        if (stageName.toLowerCase().includes("dq")) {
          closingStatus = "disqualified";
        } else {
          closingStatus = "pending_to_close";
        }
      }
      // Use the closing opp's status change timestamp when available — it
      // reflects when the closer actually moved the deal forward.
      closingStatusChangedAt =
        closing.lastStatusChangeAt ?? closing.updatedAt ?? closing.createdAt;
    }

    // status_change_date represents the moment the live transfer happened
    // (when the opening opp first reached "won"), preferring the most
    // recent reliable signal from GHL.
    const statusChangeDate =
      opp.lastStatusChangeAt ??
      closingStatusChangedAt ??
      opp.updatedAt ??
      opp.createdAt;

    rows.push({
      org_id: orgId,
      closer_id: closerId,
      lead_name: opp.contact?.name || opp.name || "Unknown Lead",
      lead_phone: opp.contact?.phone || null,
      lead_email: opp.contact?.email || null,
      business_name: opp.contact?.companyName || null,
      transfer_date: opp.lastStatusChangeAt || opp.createdAt,
      status_change_date: statusChangeDate,
      status: "funded", // legacy column kept for back-compat
      closing_status: closingStatus,
      amount: opp.monetaryValue || 0,
      ghl_opportunity_id: opp.id,
      ghl_contact_id: contactId,
    });
  }

  // ── UPSERT in chunks ──────────────────────────────────────────────
  // Upsert with `onConflict: 'ghl_opportunity_id'` — the UNIQUE index
  // on that column (from 00001_initial_schema.sql + 00003_ghl_integration.sql)
  // lets Postgres decide insert vs update per row atomically.
  let upserted = 0;
  if (rows.length > 0) {
    for (let i = 0; i < rows.length; i += 100) {
      const chunk = rows.slice(i, i + 100);
      const { error, count } = await adminSupabase
        .from("live_transfers")
        .upsert(chunk, {
          onConflict: "ghl_opportunity_id",
          count: "exact",
        });
      if (error) {
        console.error("[sync] Upsert error:", error.message);
      } else {
        upserted += count ?? chunk.length;
      }
    }
  }

  // ── Clean up stale rows in ONE DB-level delete (no pagination) ────
  // Previously we fetched existing rows first, diffed them client-side,
  // and deleted by id — but PostgREST caps row fetches at 1000 by
  // default, so the diff was blind to any stale rows beyond that limit
  // (we once had 12k+ orphaned rows lingering after a legacy script).
  //
  // This single DELETE uses `.not('ghl_opportunity_id', 'in', (...))`
  // so Postgres removes every row in the org that doesn't correspond
  // to a current GHL won-opp. No row-count limit.
  let cleanedCount = 0;
  if (syncedOppIds.size > 0) {
    const syncedList = Array.from(syncedOppIds);
    // PostgREST encodes the IN list in the URL query string. With
    // 200 opp-ids at ~24 chars each + overhead, this stays well under
    // typical server URL limits. If the opening pipeline ever grows
    // past a few thousand won-opps, split syncedList into chunks and
    // run multiple deletes with NOT IN (chunk1) AND NOT IN (chunk2).
    const { error: delError, count } = await adminSupabase
      .from("live_transfers")
      .delete({ count: "exact" })
      .eq("org_id", orgId)
      .not("ghl_opportunity_id", "in", `(${syncedList.join(",")})`);

    if (delError) {
      console.error("[sync] Stale cleanup error:", delError.message);
    } else {
      cleanedCount = count ?? 0;
      if (cleanedCount > 0) {
        console.log(`[sync] Cleaned up ${cleanedCount} stale live_transfers`);
      }
    }
  } else {
    // No won opps came back from GHL — don't nuke the whole table.
    console.warn(
      "[sync] Opening pipeline returned 0 won opps; skipping stale cleanup"
    );
  }

  console.log(
    `[sync] Synced ${upserted} transfers via upsert (cleaned ${cleanedCount} stale)`
  );

  return { transfersSynced: upserted, warning: null };
}
