/**
 * Core call processing pipeline.
 * Replicates the n8n workflow:
 *   GHL webhook → wait → fetch conversation → download recording → transcribe → Claude QA → store
 *
 * Transcription strategy (cascade):
 *   1. Try GHL's built-in transcription first (free)
 *   2. Fall back to Deepgram Nova-3 with language=multi (preferred — no
 *      25MB limit, auto-detects Spanish/English, cheaper, faster)
 *   3. Fall back to OpenAI Whisper (legacy — 25MB limit, hardcoded
 *      language=en, kept for back-compat only)
 *   4. Fail if none of the above work
 *
 * QA analysis: Claude (Anthropic) with dynamic evaluation templates per org
 */

import { GHLClient } from "@/lib/ghl/client";
// V2 analyzer: GPT-4o with 5-pillar 1–10 scoring. Replaces the legacy
// Anthropic good/partial/missed analyzer (still at `lib/anthropic/client.ts`
// but no longer wired into the pipeline). See `lib/openai/client.ts`.
import { analyzeCallQA } from "@/lib/openai/client";
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
  /** Lead ID if already resolved */
  lead_id?: string;
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
 *
 * Cascade strategy:
 *   1. GHL built-in transcription (free, if populated)
 *   2. Deepgram Nova-3 with language=multi (preferred fallback)
 *   3. OpenAI Whisper (legacy fallback)
 *   4. Error if none available
 *
 * The audio buffer is downloaded only once and reused across Deepgram
 * and Whisper attempts.
 */
async function getTranscript(
  ghl: GHLClient,
  messageId: string
): Promise<string> {
  // 1. Try GHL built-in transcription (free)
  console.log(
    `[pipeline] Trying GHL transcription for message ${messageId}...`
  );
  const ghlTranscript = await ghl.getTranscription(messageId);
  if (ghlTranscript && ghlTranscript.trim().length > 10) {
    console.log(
      `[pipeline] GHL transcription found (${ghlTranscript.length} chars)`
    );
    return ghlTranscript;
  }

  const hasDeepgram = !!process.env.DEEPGRAM_API_KEY;
  const hasWhisper = !!process.env.OPENAI_API_KEY;

  if (!hasDeepgram && !hasWhisper) {
    throw new Error(
      "No transcription available: GHL transcription empty and neither DEEPGRAM_API_KEY nor OPENAI_API_KEY are set"
    );
  }

  // Download the recording once and share it across fallback providers.
  console.log(
    `[pipeline] GHL transcription empty, downloading recording for external transcription...`
  );
  const audioBuffer = await ghl.downloadRecording(messageId);
  const sizeMb = audioBuffer.byteLength / (1024 * 1024);
  console.log(
    `[pipeline] Downloaded ${sizeMb.toFixed(1)} MB audio, attempting transcription`
  );

  // 2. Deepgram (preferred): no 25MB limit, multi-language auto-detect.
  if (hasDeepgram) {
    try {
      console.log(`[pipeline] Trying Deepgram Nova-3...`);
      const { transcribeAudio: deepgramTranscribe } = await import(
        "@/lib/deepgram/client"
      );
      const result = await deepgramTranscribe(audioBuffer);
      if (result.transcript && result.transcript.trim().length > 0) {
        console.log(
          `[pipeline] Deepgram OK (${result.transcript.length} chars, lang=${result.detectedLanguage ?? "?"}, confidence=${result.confidence?.toFixed(2) ?? "?"})`
        );
        return result.transcript;
      }
      console.warn(
        "[pipeline] Deepgram returned empty transcript, trying next fallback"
      );
    } catch (err) {
      console.warn(
        "[pipeline] Deepgram error:",
        err instanceof Error ? err.message : String(err)
      );
      // fall through to Whisper if configured
    }
  }

  // 3. Whisper (legacy). 25MB hard limit + language=en hardcoded.
  if (hasWhisper) {
    if (sizeMb > 24) {
      throw new Error(
        `Audio file is ${sizeMb.toFixed(1)}MB which exceeds Whisper's 25MB limit. Configure DEEPGRAM_API_KEY to handle large files.`
      );
    }
    console.log(`[pipeline] Falling back to Whisper...`);
    const { transcribeAudio: whisperTranscribe } = await import(
      "@/lib/openai/client"
    );
    return whisperTranscribe(audioBuffer);
  }

  throw new Error(
    "All transcription providers failed (GHL empty, Deepgram errored, no Whisper key)"
  );
}

/**
 * Find or create a lead for the given contact.
 * Returns the lead ID if found/created, null otherwise.
 */
async function resolveLeadId(
  supabase: ReturnType<typeof createAdminClient>,
  orgId: string,
  contactId: string | undefined,
  contactPhone: string | undefined,
  contactName: string,
  businessName: string | null
): Promise<string | null> {
  // Try by ghl_contact_id first
  if (contactId) {
    const { data: existingLead } = await supabase
      .from("leads")
      .select("id")
      .eq("org_id", orgId)
      .eq("ghl_contact_id", contactId)
      .maybeSingle();

    if (existingLead) return existingLead.id;
  }

  // Try by phone
  if (contactPhone) {
    const { data: existingLead } = await supabase
      .from("leads")
      .select("id")
      .eq("org_id", orgId)
      .eq("phone", contactPhone)
      .maybeSingle();

    if (existingLead) return existingLead.id;
  }

  // Create new lead with status in_sequence
  const { data: newLead } = await supabase
    .from("leads")
    .insert({
      org_id: orgId,
      name: contactName || "Unknown Lead",
      phone: contactPhone || null,
      business_name: businessName || null,
      ghl_contact_id: contactId || null,
      source: "ghl_sync",
      status: "in_sequence",
    })
    .select("id")
    .single();

  return newLead?.id || null;
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

    // Resolve lead ID
    const leadId = payload.lead_id || await resolveLeadId(
      supabase, orgId, payload.contact_id, payload.contact_phone,
      payload.contact_name, payload.business_name || null
    );

    // Load org's active evaluation template (kept for backward compat on
    // the FK column; the V2 analyzer ignores criteria/weights because the
    // 5-pillar prompt is canonical).
    const { data: template } = await supabase
      .from("evaluation_templates")
      .select("id")
      .eq("org_id", orgId)
      .eq("is_active", true)
      .maybeSingle();

    // Insert preliminary call_recording with pending status
    const { data: recording, error: insertError } = await supabase
      .from("call_recordings")
      .insert({
        org_id: orgId,
        closer_id: closerId,
        lead_id: leadId,
        evaluation_template_id: template?.id || null,
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

    // QA analysis — V2 5-pillar prompt on GPT-4o. Output: scores 1-10
    // per pillar, critical moment, pattern flags, action items.
    await supabase
      .from("call_recordings")
      .update({ processing_status: "analyzing", transcript })
      .eq("id", recording.id);

    const qaResult = await analyzeCallQA(transcript);

    // Map V2 output to legacy call_recordings columns:
    //   evaluation_score (0-100) = avg_score * 10 so existing thresholds
    //     (green >= 70, amber >= 40) still work for dashboard widgets.
    //   sentiment_score (-1..1) derived from the overall level bucket.
    const evaluationScore = Math.round(qaResult.avg_score * 10);
    const sentimentScore =
      qaResult.overall === "exceptional"
        ? 0.7
        : qaResult.overall === "developing"
          ? 0.3
          : -0.3;

    // Critical flag: avg below developing threshold OR any structural
    // pattern flag was raised. Matches the coaching trigger in N8N.
    const isCritical =
      qaResult.avg_score < 5 || qaResult.pattern_flags.length >= 2;
    const strengths = qaResult.pillars
      .filter((p) => p.score >= 8)
      .map((p) => p.name);
    const improvementAreas = qaResult.pillars
      .filter((p) => p.score < 7)
      .map((p) => p.name);

    // Action plan: prefer the model's action items; fall back to the
    // list of weak pillars if the parser couldn't extract them.
    const criticalActionPlan = isCritical
      ? qaResult.action_items.length > 0
        ? qaResult.action_items.join("\n")
        : `Rep needs coaching on: ${improvementAreas.join(", ")}`
      : null;

    // Update call_recording with final results.
    // `recording_url` is set to the authenticated proxy endpoint so the
    // React-based CallAudioPlayer components across the platform (in
    // CallDetailModal, DrillDownPanel, CriticalCallsPanel, etc.) show
    // a working player. Previously this was always "" (empty), which
    // meant every `if (call.recording_url)` guard evaluated to false
    // and no audio player was ever shown anywhere.
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
        critical_action_plan: criticalActionPlan,
        processing_status: "completed",
        recording_url: `/api/recordings/${recording.id}/audio`,
      })
      .eq("id", recording.id);

    // Mark job as completed
    await updateJobStatus(jobId, "completed", {
      completed_at: new Date().toISOString(),
      result: {
        call_recording_id: recording.id,
        lead_id: leadId,
        overall: qaResult.overall,
        evaluation_score: evaluationScore,
        avg_score: qaResult.avg_score,
        total_score: qaResult.total_score,
        pattern_flag_count: qaResult.pattern_flags.length,
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
