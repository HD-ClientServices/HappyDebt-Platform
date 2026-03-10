/**
 * Core call processing pipeline.
 * Replicates the n8n workflow:
 *   GHL webhook → wait → fetch conversation → download recording → transcribe → Claude QA → store
 *
 * Transcription strategy:
 *   1. Try GHL's built-in transcription first (free)
 *   2. Fall back to OpenAI Whisper if available
 *   3. Fail if neither works
 *
 * QA analysis: Claude (Anthropic) instead of GPT-4o
 */

import { GHLClient } from "@/lib/ghl/client";
import { analyzeCallQA } from "@/lib/anthropic/client";
import { createAdminClient } from "@/lib/supabase/admin";

interface ProcessCallPayload {
  contact_id: string;
  contact_name: string;
  contact_phone: string;
  call_duration: string | number;
  business_name: string;
  closer: string;
  /** Pre-discovered message ID (from bulk sync) — skips conversation search */
  message_id?: string;
  /** Pre-discovered conversation ID (from bulk sync) */
  conversation_id?: string;
  /** Call direction */
  direction?: string;
  /** Call date from GHL */
  call_date?: string;
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
 * Get transcript for a call message.
 * Strategy: GHL built-in transcription → OpenAI Whisper fallback → error
 */
async function getTranscript(
  ghl: GHLClient,
  messageId: string
): Promise<string> {
  // 1. Try GHL built-in transcription (free)
  console.log(`[pipeline] Trying GHL transcription for message ${messageId}...`);
  const ghlTranscript = await ghl.getTranscription(messageId);
  if (ghlTranscript && ghlTranscript.trim().length > 10) {
    console.log(`[pipeline] GHL transcription found (${ghlTranscript.length} chars)`);
    return ghlTranscript;
  }

  // 2. Fall back to OpenAI Whisper if API key is set
  if (process.env.OPENAI_API_KEY) {
    console.log(`[pipeline] GHL transcription empty, falling back to Whisper...`);
    const { transcribeAudio } = await import("@/lib/openai/client");
    const audioBuffer = await ghl.downloadRecording(messageId);
    return transcribeAudio(audioBuffer);
  }

  // 3. No transcription available — try downloading and using a basic approach
  throw new Error(
    "No transcription available: GHL transcription empty and OPENAI_API_KEY not set"
  );
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

    let messageId = payload.message_id;
    let conversationId = payload.conversation_id;

    // If we don't have pre-discovered IDs, find them via conversation search
    if (!messageId || !conversationId) {
      // Wait for recording to be ready in GHL (only for webhook-triggered calls)
      await sleep(10_000);

      const callResult = await ghl.findCompletedCallMessage(payload.contact_id);
      if (!callResult) {
        throw new Error(`No completed call found for contact ${payload.contact_id}`);
      }
      messageId = callResult.message.id;
      conversationId = callResult.conversationId;
    }

    // Check for duplicate by message_id OR conversation_id
    const { data: existingByMsg } = await supabase
      .from("call_recordings")
      .select("id")
      .eq("ghl_message_id", messageId)
      .maybeSingle();

    if (existingByMsg) {
      await updateJobStatus(jobId, "completed", {
        completed_at: new Date().toISOString(),
        result: { skipped: true, reason: "duplicate_message", call_recording_id: existingByMsg.id },
        call_recording_id: existingByMsg.id,
      });
      return;
    }

    const { data: existingByConv } = await supabase
      .from("call_recordings")
      .select("id")
      .eq("ghl_conversation_id", conversationId)
      .maybeSingle();

    if (existingByConv) {
      await updateJobStatus(jobId, "completed", {
        completed_at: new Date().toISOString(),
        result: { skipped: true, reason: "duplicate_conversation", call_recording_id: existingByConv.id },
        call_recording_id: existingByConv.id,
      });
      return;
    }

    // Insert preliminary call_recording with pending status
    const { data: recording, error: insertError } = await supabase
      .from("call_recordings")
      .insert({
        org_id: orgId,
        closer_id: closerId,
        recording_url: "",
        duration_seconds: parseInt(String(payload.call_duration)) || 0,
        call_date: payload.call_date || new Date().toISOString(),
        contact_name: payload.contact_name,
        contact_phone: payload.contact_phone,
        business_name: payload.business_name || null,
        ghl_conversation_id: conversationId,
        ghl_message_id: messageId,
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

    // Transcribe: GHL built-in → Whisper fallback
    await supabase
      .from("call_recordings")
      .update({ processing_status: "transcribing" })
      .eq("id", recording.id);

    const transcript = await getTranscript(ghl, messageId);

    // QA Analysis with Claude
    await supabase
      .from("call_recordings")
      .update({ processing_status: "analyzing", transcript })
      .eq("id", recording.id);

    const qaResult = await analyzeCallQA(transcript);

    // Compute scores for DB
    const evaluationScore = Math.round(
      (qaResult.good_count * 100 + qaResult.partial_count * 50) /
        (qaResult.good_count + qaResult.partial_count + qaResult.missed_count || 1)
    );

    // Sentiment: heuristic based on overall score
    const sentimentMap = { green: 0.7, yellow: 0.3, red: -0.3 };
    const sentimentScore = sentimentMap[qaResult.overall];

    const isCritical = qaResult.missed_count >= 2;
    const strengths = qaResult.criteria
      .filter((c) => c.score === "good")
      .map((c) => c.name);
    const improvementAreas = qaResult.criteria
      .filter((c) => c.score === "missed" || c.score === "partial")
      .map((c) => c.name);

    // Update call_recording with final results
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

    // Mark job as completed
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

    // Increment attempts
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
