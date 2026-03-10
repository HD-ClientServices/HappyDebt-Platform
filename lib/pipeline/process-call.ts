/**
 * Core call processing pipeline.
 * Replicates the n8n workflow:
 *   GHL webhook → wait → fetch conversation → download recording → Whisper → GPT-4o → store
 */

import { GHLClient } from "@/lib/ghl/client";
import { transcribeAudio, analyzeCallQA } from "@/lib/openai/client";
import { createAdminClient } from "@/lib/supabase/admin";

interface ProcessCallPayload {
  contact_id: string;
  contact_name: string;
  contact_phone: string;
  call_duration: string | number;
  business_name: string;
  closer: string;
}

interface ProcessCallOptions {
  jobId: string;
  orgId: string;
  ghlToken: string;
  ghlLocationId: string;
  closerId: string | null;
}

/** Sleep helper */
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Update job status in DB */
async function updateJobStatus(
  jobId: string,
  status: string,
  extra: Record<string, unknown> = {}
) {
  const supabase = createAdminClient();
  await supabase
    .from("processing_jobs")
    .update({ status, ...extra })
    .eq("id", jobId);
}

/**
 * Process a single call through the full pipeline.
 * This function is called by the worker API route.
 */
export async function processCall(
  payload: ProcessCallPayload,
  options: ProcessCallOptions
): Promise<void> {
  const { jobId, orgId, ghlToken, ghlLocationId, closerId } = options;
  const supabase = createAdminClient();
  const ghl = new GHLClient(ghlToken, ghlLocationId);

  try {
    // Mark job as processing
    await updateJobStatus(jobId, "processing", { started_at: new Date().toISOString() });

    // Step 1: Wait for recording to be ready in GHL (reduced from 15s to 10s)
    await sleep(10_000);

    // Step 2: Find the completed call message
    const callResult = await ghl.findCompletedCallMessage(payload.contact_id);
    if (!callResult) {
      throw new Error(`No completed call found for contact ${payload.contact_id}`);
    }

    const { message: callMsg, conversationId } = callResult;

    // Check for duplicate
    const { data: existing } = await supabase
      .from("call_recordings")
      .select("id")
      .eq("ghl_conversation_id", conversationId)
      .maybeSingle();

    if (existing) {
      await updateJobStatus(jobId, "completed", {
        completed_at: new Date().toISOString(),
        result: { skipped: true, reason: "duplicate", call_recording_id: existing.id },
        call_recording_id: existing.id,
      });
      return;
    }

    // Step 3: Insert preliminary call_recording with pending status
    const { data: recording, error: insertError } = await supabase
      .from("call_recordings")
      .insert({
        org_id: orgId,
        closer_id: closerId,
        recording_url: "",
        duration_seconds: parseInt(String(payload.call_duration)) || 0,
        call_date: new Date().toISOString(),
        contact_name: payload.contact_name,
        contact_phone: payload.contact_phone,
        business_name: payload.business_name || null,
        ghl_conversation_id: conversationId,
        ghl_message_id: callMsg.id,
        processing_status: "transcribing",
        is_critical: false,
      })
      .select("id")
      .single();

    if (insertError) throw new Error(`DB insert failed: ${insertError.message}`);

    // Update job with recording reference
    await supabase
      .from("processing_jobs")
      .update({ call_recording_id: recording.id })
      .eq("id", jobId);

    // Step 4: Download recording
    const audioBuffer = await ghl.downloadRecording(callMsg.id);

    // Step 5: Transcribe with Whisper
    await supabase
      .from("call_recordings")
      .update({ processing_status: "transcribing" })
      .eq("id", recording.id);

    const transcript = await transcribeAudio(audioBuffer);

    // Step 6: QA Analysis with GPT-4o
    await supabase
      .from("call_recordings")
      .update({ processing_status: "analyzing", transcript })
      .eq("id", recording.id);

    const qaResult = await analyzeCallQA(transcript);

    // Step 7: Compute scores for DB
    const evaluationScore = Math.round(
      (qaResult.good_count * 100 + qaResult.partial_count * 50) /
        (qaResult.good_count + qaResult.partial_count + qaResult.missed_count || 1)
    );

    // Sentiment: simple heuristic based on overall score
    const sentimentMap = { green: 0.7, yellow: 0.3, red: -0.3 };
    const sentimentScore = sentimentMap[qaResult.overall];

    const isCritical = qaResult.missed_count >= 2;
    const strengths = qaResult.criteria
      .filter((c) => c.score === "good")
      .map((c) => c.name);
    const improvementAreas = qaResult.criteria
      .filter((c) => c.score === "missed" || c.score === "partial")
      .map((c) => c.name);

    // Step 8: Update call_recording with final results
    await supabase
      .from("call_recordings")
      .update({
        transcript,
        ai_analysis: qaResult,
        sentiment_score: sentimentScore,
        evaluation_score: evaluationScore,
        strengths,
        improvement_areas: improvementAreas,
        is_critical: isCritical,
        critical_action_plan: isCritical
          ? `Rep needs coaching on: ${improvementAreas.join(", ")}`
          : null,
        processing_status: "completed",
      })
      .eq("id", recording.id);

    // Step 9: Mark job as completed
    await updateJobStatus(jobId, "completed", {
      completed_at: new Date().toISOString(),
      result: {
        call_recording_id: recording.id,
        overall: qaResult.overall,
        evaluation_score: evaluationScore,
        good: qaResult.good_count,
        partial: qaResult.partial_count,
        missed: qaResult.missed_count,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[processCall] Job ${jobId} failed:`, message);

    // Update job as failed
    await updateJobStatus(jobId, "failed", {
      error_message: message,
    });

    // Increment attempts via direct update
    const { data: currentJob } = await supabase
      .from("processing_jobs")
      .select("attempts")
      .eq("id", jobId)
      .single();
    if (currentJob) {
      await supabase
        .from("processing_jobs")
        .update({ attempts: (currentJob.attempts || 0) + 1 })
        .eq("id", jobId);
    }

    throw error;
  }
}
