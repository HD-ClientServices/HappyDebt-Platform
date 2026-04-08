/**
 * GHL Call Webhook — receives call events from Go High Level.
 * Responds 200 immediately, then triggers async processing.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { GHLCallWebhookPayload } from "@/lib/ghl/types";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const payload: GHLCallWebhookPayload = body.body || body;

    // Validate required fields
    if (!payload.contact_id) {
      return NextResponse.json({ error: "Missing contact_id" }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Resolve which org should own this lead.
    //
    // Migration 00015 made GHL credentials global (one Go High Level
    // account for the entire platform), so we can no longer match a
    // webhook payload to an org by location id. For now we route every
    // incoming call to the org with the most recent GHL activity (in
    // practice that's Rise — the only client onboarded so far).
    //
    // When the second client lands we'll revisit this with a custom
    // field on the GHL contact (e.g. `intro_org_slug`) and route by
    // that. Tracked as a TODO in the live-transfers spec.
    const { data: defaultOrg } = await supabase
      .from("organizations")
      .select("id")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    const orgId = defaultOrg?.id ?? null;

    if (!orgId) {
      return NextResponse.json({ error: "No organization found" }, { status: 404 });
    }

    // Find or create the closer by name
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
        // Create a new closer entry
        const { data: newCloser } = await supabase
          .from("closers")
          .insert({ org_id: orgId, name: payload.closer, active: true })
          .select("id")
          .single();
        closerId = newCloser?.id || null;
      }
    }

    // ── Resolve or create lead by ghl_contact_id ────────────────────
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
        // Create a new lead for this contact
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
    // singleton `ghl_integration` table at run time. Keeping the legacy
    // `ghl_token` / `ghl_location_id` fields out of the payload also
    // prevents them from leaking into logs or DB rows.
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
