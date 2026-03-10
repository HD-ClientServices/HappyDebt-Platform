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

    // Find org by GHL location ID (or use default/env)
    const ghlLocationId = process.env.GHL_LOCATION_ID;
    let orgId: string | null = null;

    if (ghlLocationId) {
      const { data: org } = await supabase
        .from("organizations")
        .select("id")
        .eq("ghl_location_id", ghlLocationId)
        .maybeSingle();
      orgId = org?.id || null;
    }

    // Fallback: get the first org if no match
    if (!orgId) {
      const { data: org } = await supabase
        .from("organizations")
        .select("id")
        .limit(1)
        .single();
      orgId = org?.id || null;
    }

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

    // Insert processing job
    const { data: job, error: jobError } = await supabase
      .from("processing_jobs")
      .insert({
        org_id: orgId,
        job_type: "call_analysis",
        status: "pending",
        payload: {
          ...payload,
          closer_id: closerId,
          ghl_token: process.env.GHL_API_TOKEN,
          ghl_location_id: ghlLocationId,
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
