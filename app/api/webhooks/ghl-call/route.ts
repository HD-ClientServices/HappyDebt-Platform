/**
 * GHL Call Webhook — receives call events from Go High Level.
 * Responds 200 immediately, then triggers async processing.
 *
 * ## Org routing (post migration 00016)
 *
 * Every incoming call has to be attributed to ONE client org — that's
 * how we scope the resulting live_transfer row, lead, and
 * processing_job. Since migration 00016 put the pipeline IDs back on
 * `organizations`, the canonical routing rule is:
 *
 *   1. If the GHL payload includes a `pipeline_id`, look up the org
 *      whose `ghl_opening_pipeline_id` OR `ghl_closing_pipeline_id`
 *      matches it. That org owns the call.
 *   2. If the payload has no pipeline_id (GHL call-completed webhooks
 *      historically don't include it), fall back to the "single
 *      configured org" path — this works for any single-tenant
 *      deployment like Rise today.
 *   3. If the fallback applies but there are 2+ configured orgs, fail
 *      with a loud error. We refuse to guess which tenant the call
 *      belongs to. TODO: when the second client lands, we'll extend
 *      this to look up the GHL contact's opportunities and match by
 *      pipeline, or use a custom field like `intro_org_slug`.
 *
 * The platform superadmin org (`intro`) is NEVER a valid routing
 * target — it has no pipelines configured, so
 * `listConfiguredOrgPipelines()` naturally excludes it.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { GHLCallWebhookPayload } from "@/lib/ghl/types";
import {
  listConfiguredOrgPipelines,
  findOrgByPipelineId,
  type OrgPipelineConfig,
} from "@/lib/ghl/getGlobalConfig";

async function resolveOwnerOrg(
  payload: GHLCallWebhookPayload
): Promise<
  | { ok: true; org: OrgPipelineConfig }
  | { ok: false; status: number; error: string }
> {
  // 1. Pipeline-id path
  const pipelineId = payload.pipeline_id ?? payload.pipelineId;
  if (pipelineId) {
    const org = await findOrgByPipelineId(pipelineId);
    if (org) return { ok: true, org };
    // Pipeline id given but no org owns it → this is actionable for
    // the admin (misconfiguration), surface it as 404.
    return {
      ok: false,
      status: 404,
      error: `No organization owns pipeline ${pipelineId}. Configure it under Admin → Organizations → Configure Pipelines.`,
    };
  }

  // 2. Fallback: single configured org
  const configured = await listConfiguredOrgPipelines();
  if (configured.length === 0) {
    return {
      ok: false,
      status: 400,
      error:
        "No organizations have pipelines configured. Set one up under Admin → Organizations → Configure Pipelines before receiving webhooks.",
    };
  }
  if (configured.length === 1) {
    return { ok: true, org: configured[0] };
  }

  // 2+ configured orgs and no pipeline_id → refuse to guess.
  return {
    ok: false,
    status: 400,
    error: `Multiple organizations are configured (${configured
      .map((o) => o.orgSlug)
      .join(", ")}) but the webhook payload has no pipeline_id to route by. Ask the GHL admin to include pipeline_id in the webhook, or implement custom-field routing.`,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const payload: GHLCallWebhookPayload = body.body || body;

    // Validate required fields
    if (!payload.contact_id) {
      return NextResponse.json({ error: "Missing contact_id" }, { status: 400 });
    }

    // ── Resolve owner org from pipeline_id or fallback ───────────
    const resolved = await resolveOwnerOrg(payload);
    if (!resolved.ok) {
      console.warn(`[webhook] Org resolution failed: ${resolved.error}`);
      return NextResponse.json(
        { error: resolved.error },
        { status: resolved.status }
      );
    }
    const orgId = resolved.org.orgId;

    const supabase = createAdminClient();

    // Find or create the closer by name (scoped to the resolved org)
    let closerId: string | null = null;
    if (payload.closer && payload.closer !== "N/A") {
      const { data: closer } = await supabase
        .from("closers")
        .select("id")
        .eq("org_id", orgId)
        .ilike("name", `%${payload.closer}%`)
        .maybeSingle();

      if (closer) {
        closerId = closer.id;
      } else {
        const { data: newCloser } = await supabase
          .from("closers")
          .insert({ org_id: orgId, name: payload.closer, active: true })
          .select("id")
          .single();
        closerId = newCloser?.id || null;
      }
    }

    // ── Resolve or create lead by ghl_contact_id (scoped to org) ─
    let leadId: string | null = null;
    if (payload.contact_id) {
      const { data: existingLead } = await supabase
        .from("leads")
        .select("id")
        .eq("org_id", orgId)
        .eq("ghl_contact_id", payload.contact_id)
        .maybeSingle();

      if (existingLead) {
        leadId = existingLead.id;
      } else {
        const { data: newLead } = await supabase
          .from("leads")
          .insert({
            org_id: orgId,
            name: payload.contact_name || "Unknown",
            phone: payload.contact_phone || null,
            source: "ghl_sync",
            status: "in_sequence",
            ghl_contact_id: payload.contact_id,
            closer_id: closerId,
          })
          .select("id")
          .single();
        leadId = newLead?.id || null;
      }
    }

    // Insert processing job. We no longer carry GHL credentials in the
    // payload — the worker (`/api/pipeline/process`) loads them from the
    // singleton `ghl_integration` table at run time.
    const { data: job, error: jobError } = await supabase
      .from("processing_jobs")
      .insert({
        org_id: orgId,
        job_type: "call_analysis",
        status: "pending",
        payload: {
          ...payload,
          closer_id: closerId,
          lead_id: leadId,
        },
      })
      .select("id")
      .single();

    if (jobError) {
      console.error("[webhook] Failed to create job:", jobError);
      return NextResponse.json({ error: "Failed to queue job" }, { status: 500 });
    }

    console.log(
      `[webhook] Queued job ${job.id.slice(0, 8)} for org ${resolved.org.orgSlug}`
    );

    // Fire-and-forget: trigger the processing worker
    const baseUrl = req.headers.get("host") || "localhost:3000";
    const protocol = baseUrl.includes("localhost") ? "http" : "https";
    fetch(`${protocol}://${baseUrl}/api/pipeline/process`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-pipeline-secret": process.env.PIPELINE_SECRET || "",
      },
      body: JSON.stringify({ jobId: job.id }),
    }).catch((err) => console.error("[webhook] Worker trigger failed:", err));

    return NextResponse.json({ success: true, jobId: job.id });
  } catch (error) {
    console.error("[webhook] Error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
