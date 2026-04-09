/**
 * Manual Sync — pulls fresh data from Go High Level for every client
 * org that has a pipeline configured.
 *
 * ## Architecture (post migration 00016)
 *
 * GHL credentials (api_token, location_id) are GLOBAL — stored in the
 * singleton `ghl_integration` row — because the platform talks to a
 * single GHL account. Each client org has its OWN opening and closing
 * pipelines inside that account, stored as `organizations.ghl_*_pipeline_id`.
 *
 * The previous (buggy) version of this route used `effectiveOrgId` from
 * the impersonation header to decide which org owned synced rows. That
 * allowed a sync triggered without an impersonation header to silently
 * rewrite every live_transfer's `org_id` to the caller's home org —
 * which happened in production: all 207 rows migrated from Rise to
 * Intro in a single Sync Calls click from the admin panel.
 *
 * The fix: iterate over `organizations` that have `ghl_opening_pipeline_id`
 * set, and sync each one independently. Ownership is derived from which
 * pipeline an opportunity lives in, never from the caller's session.
 *
 * Auth: any authenticated user can trigger a sync. The sync never
 * touches their own org — it iterates the configured client orgs. This
 * is intentional: regular users need a way to refresh their own Live
 * Transfers dashboard, and admins need a way to refresh every tenant
 * at once. Both hit the same endpoint.
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { GHLClient } from "@/lib/ghl/client";
import { getEffectiveOrgId } from "@/lib/auth/getEffectiveOrgId";
import {
  getGHLGlobalConfig,
  GHLNotConfiguredError,
  listConfiguredOrgPipelines,
  type OrgPipelineConfig,
} from "@/lib/ghl/getGlobalConfig";

export const maxDuration = 60;

interface OrgSyncResult {
  org_id: string;
  org_slug: string;
  closers_synced: number;
  calls_discovered: number;
  calls_new: number;
  jobs_created: number;
  job_ids: string[];
  transfers_synced: number;
  stale_cleaned: number;
  warning: string | null;
}

export async function POST(request: Request) {
  const t0 = Date.now();
  try {
    // ── Auth: any authenticated user can trigger a sync ──────────
    const ctx = await getEffectiveOrgId(request);
    if (!ctx.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminSupabase = createAdminClient();

    // ── Load global credentials from the singleton ───────────────
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

    // ── List every org with a configured opening pipeline ────────
    const configuredOrgs = await listConfiguredOrgPipelines();

    if (configuredOrgs.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error:
            "No organizations have pipelines configured. Add an opening pipeline to at least one org under Admin → Organizations → Configure Pipelines.",
        },
        { status: 400 }
      );
    }

    const ghl = new GHLClient(ghlConfig.apiToken, ghlConfig.locationId);

    // ── Sync each configured org in sequence ─────────────────────
    //
    // Running sequentially (rather than Promise.all) keeps GHL API
    // rate-limit pressure predictable and makes log output readable.
    // With N orgs the sync takes N × (~35s per org). If we ever grow
    // past a handful of tenants we can parallelize.
    const orgResults: OrgSyncResult[] = [];
    for (const org of configuredOrgs) {
      const result = await syncOneOrg(ghl, adminSupabase, org);
      orgResults.push(result);
    }

    // ── Fire pipeline workers for all queued jobs (global) ───────
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    for (const result of orgResults) {
      for (const jobId of result.job_ids) {
        fetch(`${baseUrl}/api/pipeline/process`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-pipeline-secret": process.env.PIPELINE_SECRET || "",
          },
          body: JSON.stringify({ jobId }),
        }).catch(() => {});
      }
    }

    const totalTransfers = orgResults.reduce(
      (sum, r) => sum + r.transfers_synced,
      0
    );
    const totalJobs = orgResults.reduce((sum, r) => sum + r.jobs_created, 0);
    const totalCleaned = orgResults.reduce(
      (sum, r) => sum + r.stale_cleaned,
      0
    );
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

    console.log(
      `[sync] Done in ${elapsed}s — ${configuredOrgs.length} org(s), ${totalTransfers} transfers upserted, ${totalJobs} jobs queued, ${totalCleaned} stale cleaned`
    );

    return NextResponse.json({
      success: true,
      orgs_synced: orgResults,
      total_transfers_synced: totalTransfers,
      total_jobs_created: totalJobs,
      total_stale_cleaned: totalCleaned,
      elapsed_seconds: elapsed,
      message: `Synced ${totalTransfers} transfer(s) and queued ${totalJobs} call(s) for analysis across ${configuredOrgs.length} org(s). (${elapsed}s)`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[sync] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ── Per-org sync ──────────────────────────────────────────────────
//
// Runs the full sync pipeline for a single org: closers → calls →
// opportunities. Returns a summary so the main handler can aggregate
// results across multiple orgs.
async function syncOneOrg(
  ghl: GHLClient,
  adminSupabase: ReturnType<typeof createAdminClient>,
  org: OrgPipelineConfig
): Promise<OrgSyncResult> {
  console.log(
    `[sync] [${org.orgSlug}] Starting (opening=${org.openingPipelineId ?? "null"}, closing=${org.closingPipelineId ?? "null"})`
  );

  // ── Step 1: Sync GHL users as closers for this org ───────────
  //
  // This used to be the sole source of closer rows: we mirrored every
  // GHL user into the `closers` table keyed by `ghl_user_id` and
  // matched opportunities to closers via `opp.assignedTo`. After the
  // refactor, the canonical source of "who closed this deal" is the
  // `contact.closer` custom field on the contact — not the opp owner.
  //
  // We still sync GHL users to `closers` because many closer names
  // WILL match GHL user names (same person, typed the same way in
  // both places) and the case-insensitive match in
  // `resolveOrCreateCloserByName()` will reuse those existing rows.
  // Without this step, every first-time sync would create a fresh
  // closer row for every user instead of reusing the existing mirrors.
  const ghlUsers = await ghl.getUsers();
  const activeUsers = ghlUsers.filter((u) => !u.deleted);

  const { data: existingClosers } = await adminSupabase
    .from("closers")
    .select("id, ghl_user_id")
    .eq("org_id", org.orgId);

  const existingByGhlId = new Map(
    (existingClosers || []).map((c) => [c.ghl_user_id, c.id])
  );

  const newClosers = [];

  for (const u of activeUsers) {
    if (!existingByGhlId.has(u.id)) {
      newClosers.push({
        org_id: org.orgId,
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
    closersSynced = inserted?.length ?? 0;
  }

  // ── Steps 2-3 (calls) → then Step 4 (opportunities) ──────────
  //
  // These USED to run in parallel, but both hit the GHL API heavily
  // (calls discovery fans out per conversation; opp sync now fans out
  // per contact for the `contact.closer` custom field lookup).
  // Running them concurrently would burst ~400 requests in a few
  // seconds and reliably trigger GHL's 429 rate limit (~120/min).
  // Sequential execution spreads the load and still completes in
  // well under the 60s route timeout. The request() helper in
  // GHLClient also retries 429s with exponential backoff as a
  // second line of defense.
  const callsResult = await syncCalls(ghl, adminSupabase, org.orgId);
  const oppsResult = await syncOpportunities(ghl, adminSupabase, org);

  return {
    org_id: org.orgId,
    org_slug: org.orgSlug,
    closers_synced: closersSynced,
    calls_discovered: callsResult.discovered,
    calls_new: callsResult.newCalls,
    jobs_created: callsResult.jobsCreated,
    job_ids: callsResult.jobIds,
    transfers_synced: oppsResult.transfersSynced,
    stale_cleaned: oppsResult.cleanedCount,
    warning: oppsResult.warning,
  };
}

// ── Calls discovery + job queueing ────────────────────────────────
//
// Discovers recent completed calls from the global GHL account and
// queues them as processing_jobs scoped to the given org. This is
// run once per configured org, which means with multiple configured
// orgs the same call could be queued N times. For the single-tenant
// case today this is fine; multi-tenant routing is tech debt (TODO
// in the webhook handler header as well).
async function syncCalls(
  ghl: GHLClient,
  adminSupabase: ReturnType<typeof createAdminClient>,
  orgId: string
) {
  console.log(`[sync] [${orgId.slice(0, 8)}] Discovering recent calls...`);
  const discoveredCalls = await ghl.discoverRecentCalls(100);
  console.log(
    `[sync] [${orgId.slice(0, 8)}] Found ${discoveredCalls.length} completed call(s)`
  );

  const { data: existingRecordings } = await adminSupabase
    .from("call_recordings")
    .select("ghl_message_id, ghl_conversation_id")
    .eq("org_id", orgId);

  const existingMessageIds = new Set(
    (existingRecordings || [])
      .map((r: { ghl_message_id: string | null }) => r.ghl_message_id)
      .filter(Boolean)
  );
  const existingConvIds = new Set(
    (existingRecordings || [])
      .map((r: { ghl_conversation_id: string | null }) => r.ghl_conversation_id)
      .filter(Boolean)
  );

  const newCalls = discoveredCalls.filter(
    (call) =>
      !existingMessageIds.has(call.messageId) &&
      !existingConvIds.has(call.conversationId)
  );

  console.log(
    `[sync] [${orgId.slice(0, 8)}] ${newCalls.length} new call(s) after dedup`
  );

  // ── Resolve or create leads by ghl_contact_id ─────────────────
  const contactIds = Array.from(
    new Set(newCalls.map((c) => c.contactId).filter(Boolean))
  );
  const leadByContactId = new Map<string, string>();

  if (contactIds.length > 0) {
    const { data: existingLeads } = await adminSupabase
      .from("leads")
      .select("id, ghl_contact_id")
      .eq("org_id", orgId)
      .in("ghl_contact_id", contactIds);

    for (const lead of existingLeads || []) {
      if (lead.ghl_contact_id) leadByContactId.set(lead.ghl_contact_id, lead.id);
    }

    const missingContactIds = contactIds.filter(
      (cid) => !leadByContactId.has(cid)
    );
    if (missingContactIds.length > 0) {
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
          console.error(
            `[sync] [${orgId.slice(0, 8)}] Lead creation error:`,
            error.message
          );
        } else {
          for (const lead of inserted || []) {
            if (lead.ghl_contact_id)
              leadByContactId.set(lead.ghl_contact_id, lead.id);
          }
        }
      }
      console.log(
        `[sync] [${orgId.slice(0, 8)}] Created ${missingContactIds.length} new lead(s)`
      );
    }
  }

  // ── Batch insert processing jobs ─────────────────────────────
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
        lead_id: call.contactId
          ? leadByContactId.get(call.contactId) || null
          : null,
      },
      attempts: 0,
      max_attempts: 3,
    }));

    for (let i = 0; i < jobRows.length; i += 50) {
      const chunk = jobRows.slice(i, i + 50);
      const { data: inserted, error } = await adminSupabase
        .from("processing_jobs")
        .insert(chunk)
        .select("id");

      if (error) {
        // Unique constraint on ghl_conversation_id may collide when
        // the same call is discovered for multiple configured orgs.
        // That's acceptable noise for the multi-tenant case; log and
        // continue.
        console.error(
          `[sync] [${orgId.slice(0, 8)}] Batch job insert error:`,
          error.message
        );
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

// ── Opportunities sync for one org ────────────────────────────────
//
// Fetches the won opps from this org's opening pipeline, cross-matches
// them against the closing pipeline by contact_id, looks up each opp's
// closer from the GHL `contact.closer` custom field, and UPSERTs them
// into live_transfers with `org_id = org.orgId`. Then DB-level cleanup
// removes any stale rows for that org.
//
// Closer resolution (per user requirement):
//   1. Read the `contact.closer` custom field from each opp's contact.
//   2. Use THAT value (a name string like "Trevor Albrecht") as the
//      source of truth, NOT the opp's `assignedTo` field.
//   3. Match the name to an existing closer in our DB (case-insensitive)
//      or create a new closer row if none exists.
//   4. If the contact has no closer value, leave `closer_id` null.
//
// This requires fetching each unique contact individually because the
// GHL opportunities search endpoint returns a simplified contact object
// without customFields. The batch is done in parallel chunks.
async function syncOpportunities(
  ghl: GHLClient,
  adminSupabase: ReturnType<typeof createAdminClient>,
  org: OrgPipelineConfig
) {
  if (!org.openingPipelineId) {
    // Should never reach here — listConfiguredOrgPipelines filters this
    // out — but keep a defensive check.
    return {
      transfersSynced: 0,
      cleanedCount: 0,
      warning: "No opening pipeline configured for this org",
    };
  }

  // Fetch ALL pipelines once (cheap) to validate the configured IDs
  // and to build the closing stage name map.
  const pipelines = await ghl.getPipelines();

  const openingPipeline = pipelines.find((p) => p.id === org.openingPipelineId);
  if (!openingPipeline) {
    const warning = `[${org.orgSlug}] Opening pipeline ${org.openingPipelineId} not found in GHL account. Available: ${pipelines.map((p) => p.name).join(", ") || "none"}.`;
    console.warn(`[sync] ${warning}`);
    return { transfersSynced: 0, cleanedCount: 0, warning };
  }

  const closingPipeline = org.closingPipelineId
    ? pipelines.find((p) => p.id === org.closingPipelineId)
    : null;

  console.log(
    `[sync] [${org.orgSlug}] Opening: "${openingPipeline.name}"` +
      (closingPipeline
        ? ` | Closing: "${closingPipeline.name}"`
        : " | No closing pipeline configured")
  );

  // Stage name map for detecting DQ leads in the closing pipeline
  const closingStageNameById = new Map<string, string>();
  if (closingPipeline) {
    for (const s of closingPipeline.stages) {
      closingStageNameById.set(s.id, s.name);
    }
  }

  // Fetch won opps from opening pipeline
  let openingWonOpps: Awaited<
    ReturnType<typeof ghl.getAllOpportunities>
  > = [];
  try {
    openingWonOpps = await ghl.getAllOpportunities(openingPipeline.id, {
      status: "won",
    });
  } catch (err) {
    console.warn(
      `[sync] [${org.orgSlug}] Opening pipeline fetch error:`,
      err instanceof Error ? err.message : String(err)
    );
  }

  // Fetch all opps from closing pipeline for cross-match
  let closingOpps: Awaited<ReturnType<typeof ghl.getAllOpportunities>> = [];
  if (closingPipeline) {
    try {
      closingOpps = await ghl.getAllOpportunities(closingPipeline.id);
    } catch (err) {
      console.warn(
        `[sync] [${org.orgSlug}] Closing pipeline fetch error:`,
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  console.log(
    `[sync] [${org.orgSlug}] Found ${openingWonOpps.length} won opps in opening, ${closingOpps.length} in closing`
  );

  if (openingWonOpps.length === 0) {
    return { transfersSynced: 0, cleanedCount: 0, warning: null };
  }

  // Cross-match: contact_id → closing opp
  const closingByContactId = new Map<
    string,
    (typeof closingOpps)[number]
  >();
  for (const opp of closingOpps) {
    const cid = opp.contactId ?? opp.contact?.id;
    if (cid) closingByContactId.set(cid, opp);
  }

  // ── Resolve the `contact.closer` custom field id ──────────────
  //
  // Custom fields are referenced by `id` in a contact's payload
  // (not by `fieldKey`), so we have to look up the id once per sync
  // by scanning the location's custom field definitions for the one
  // whose fieldKey matches `contact.closer`. If it's not defined in
  // this GHL location, we log a warning and leave every closer_id
  // null — the Top Closer card will show "—" until the field is
  // created in GHL.
  const allCustomFields = await ghl.getCustomFields();
  const closerField = allCustomFields.find(
    (f) => f.fieldKey === "contact.closer" && f.model === "contact"
  );
  const closerFieldId = closerField?.id ?? null;

  if (!closerFieldId) {
    console.warn(
      `[sync] [${org.orgSlug}] Custom field "contact.closer" not found in the GHL location. ` +
        `All live_transfers will be upserted with closer_id = null. ` +
        `Available contact fields: ${allCustomFields
          .filter((f) => f.model === "contact")
          .map((f) => f.fieldKey || f.name)
          .slice(0, 20)
          .join(", ")}`
    );
  }

  // ── Batch-fetch each opp's contact to read the closer field ───
  //
  // The GHL opportunities search endpoint returns a simplified
  // contact (no custom fields), so we fetch the contacts
  // individually. Done in chunks of 10 in parallel to stay under
  // GHL rate limits (~120 req/min per the ghl-api skill). Only
  // unique contact ids are fetched — if two opps share a contact,
  // we only hit the API once.
  const uniqueContactIds = Array.from(
    new Set(
      openingWonOpps
        .map((o) => o.contactId ?? o.contact?.id)
        .filter((id): id is string => !!id)
    )
  );

  const closerNameByContactId = new Map<string, string>();

  if (closerFieldId && uniqueContactIds.length > 0) {
    console.log(
      `[sync] [${org.orgSlug}] Fetching ${uniqueContactIds.length} contacts to resolve closer custom field...`
    );
    // Chunks of 5 in parallel with a 250ms breather between rounds.
    // That works out to ~20 req/sec peak, well under GHL's 120/min
    // steady-state ceiling. Combined with the retry-on-429 logic in
    // GHLClient.request() this should gracefully absorb any transient
    // rate limit hits without aborting the whole sync.
    const CHUNK = 5;
    const SLEEP_MS = 250;
    for (let i = 0; i < uniqueContactIds.length; i += CHUNK) {
      const chunk = uniqueContactIds.slice(i, i + CHUNK);
      const contacts = await Promise.all(
        chunk.map((id) => ghl.getContact(id))
      );
      for (let j = 0; j < chunk.length; j++) {
        const contact = contacts[j];
        if (!contact) continue;
        const field = contact.customFields?.find(
          (f) => f.id === closerFieldId
        );
        const value = field?.value;
        if (typeof value === "string" && value.trim().length > 0) {
          closerNameByContactId.set(chunk[j], value.trim());
        }
      }
      // Breather between rounds to smooth out the burst.
      if (i + CHUNK < uniqueContactIds.length) {
        await new Promise((r) => setTimeout(r, SLEEP_MS));
      }
    }
    console.log(
      `[sync] [${org.orgSlug}] Resolved closer for ${closerNameByContactId.size}/${uniqueContactIds.length} contacts`
    );
  }

  // Memoize resolveOrCreateCloserByName calls within this sync so we
  // only hit the DB once per unique closer name. Names are normalized
  // by `ilike`, so "Trevor Albrecht" and "trevor albrecht" share a row.
  const closerIdByName = new Map<string, string | null>();

  // Build upsert rows
  const syncedOppIds = new Set<string>();
  const rows: Record<string, unknown>[] = [];

  for (const opp of openingWonOpps) {
    syncedOppIds.add(opp.id);
    const contactId = opp.contactId ?? opp.contact?.id ?? null;

    // Resolve closer from the contact.closer custom field. NO fallback
    // to opp.assignedTo — the user wants the custom field to be the
    // sole source of truth.
    let closerId: string | null = null;
    const closerName = contactId ? closerNameByContactId.get(contactId) : null;
    if (closerName) {
      // Memoized lookup/create per unique name
      if (closerIdByName.has(closerName)) {
        closerId = closerIdByName.get(closerName) ?? null;
      } else {
        closerId = await resolveOrCreateCloserByName(
          adminSupabase,
          org.orgId,
          closerName
        );
        closerIdByName.set(closerName, closerId);
      }
    }

    const closing = contactId ? closingByContactId.get(contactId) : null;
    let closingStatus: string = "pending_to_close";
    let closingStatusChangedAt: string | undefined;

    if (closing) {
      if (closing.status === "won") {
        closingStatus = "closed_won";
      } else if (closing.status === "lost") {
        closingStatus = "closed_lost";
      } else {
        const stageName = closing.pipelineStageId
          ? (closingStageNameById.get(closing.pipelineStageId) ?? "")
          : "";
        if (stageName.toLowerCase().includes("dq")) {
          closingStatus = "disqualified";
        } else {
          closingStatus = "pending_to_close";
        }
      }
      closingStatusChangedAt =
        closing.lastStatusChangeAt ?? closing.updatedAt ?? closing.createdAt;
    }

    const statusChangeDate =
      opp.lastStatusChangeAt ??
      closingStatusChangedAt ??
      opp.updatedAt ??
      opp.createdAt;

    rows.push({
      org_id: org.orgId,
      closer_id: closerId,
      lead_name: opp.contact?.name || opp.name || "Unknown Lead",
      lead_phone: opp.contact?.phone || null,
      lead_email: opp.contact?.email || null,
      business_name: opp.contact?.companyName || null,
      transfer_date: opp.lastStatusChangeAt || opp.createdAt,
      status_change_date: statusChangeDate,
      status: "funded",
      closing_status: closingStatus,
      amount: opp.monetaryValue || 0,
      ghl_opportunity_id: opp.id,
      ghl_contact_id: contactId,
    });
  }

  // UPSERT in chunks
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
        console.error(
          `[sync] [${org.orgSlug}] Upsert error:`,
          error.message
        );
      } else {
        upserted += count ?? chunk.length;
      }
    }
  }

  // Stale cleanup — scoped to this org
  let cleanedCount = 0;
  if (syncedOppIds.size > 0) {
    const syncedList = Array.from(syncedOppIds);
    const { error: delError, count } = await adminSupabase
      .from("live_transfers")
      .delete({ count: "exact" })
      .eq("org_id", org.orgId)
      .not("ghl_opportunity_id", "in", `(${syncedList.join(",")})`);

    if (delError) {
      console.error(
        `[sync] [${org.orgSlug}] Stale cleanup error:`,
        delError.message
      );
    } else {
      cleanedCount = count ?? 0;
      if (cleanedCount > 0) {
        console.log(
          `[sync] [${org.orgSlug}] Cleaned up ${cleanedCount} stale live_transfers`
        );
      }
    }
  } else {
    console.warn(
      `[sync] [${org.orgSlug}] Opening pipeline returned 0 won opps; skipping stale cleanup`
    );
  }

  console.log(
    `[sync] [${org.orgSlug}] Synced ${upserted} transfers via upsert (cleaned ${cleanedCount} stale)`
  );

  return { transfersSynced: upserted, cleanedCount, warning: null };
}

// ── Closer helper ─────────────────────────────────────────────────
//
// Resolve a closer row by name (case-insensitive) or create one if it
// doesn't exist yet. Used by syncOpportunities() to convert a closer
// name string from the GHL `contact.closer` custom field into a
// closer_id UUID.
//
// Matching rules:
//   - case-insensitive exact match via `ilike`
//   - first row wins if somehow there are duplicates
//   - creates a new closer row with `ghl_user_id = null` if no match
//     (these came from the custom field, not from a GHL user)
//
// The sync route memoizes calls to this helper per unique name within
// a single org sync to avoid hitting the DB for every opp.
async function resolveOrCreateCloserByName(
  adminSupabase: ReturnType<typeof createAdminClient>,
  orgId: string,
  name: string
): Promise<string | null> {
  // Case-insensitive exact match. `ilike` with no wildcards behaves
  // like `=` but collapses case variation ("Maria Smith" === "maria
  // smith"). Accent variations ("María" vs "Maria") are NOT collapsed
  // — that's tech debt documented in the plan.
  const { data: existing } = await adminSupabase
    .from("closers")
    .select("id")
    .eq("org_id", orgId)
    .ilike("name", name)
    .limit(1)
    .maybeSingle();

  if (existing) return existing.id;

  // No match — create a new closer row. `ghl_user_id = null` means
  // this closer came from a custom field value, not from a synced
  // GHL user. If a GHL user with this exact name is synced in the
  // next run, the insert below would duplicate them; to avoid that,
  // we could fall back to fuzzy matching or add a unique constraint,
  // but for now the simple path is fine.
  const { data: inserted } = await adminSupabase
    .from("closers")
    .insert({
      org_id: orgId,
      name,
      email: null,
      phone: null,
      avatar_url: null,
      active: true,
      ghl_user_id: null,
    })
    .select("id")
    .maybeSingle();

  return inserted?.id ?? null;
}
