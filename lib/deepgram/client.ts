/**
 * Deepgram integration for call transcription.
 *
 * Preferred over Whisper for MCA call recordings because:
 *   - No 25 MB file size limit (Whisper's hard limit truncates long calls)
 *   - Automatic language detection (handles English, Spanish, etc. via
 *     `language=multi`) — solves the "Spanish call problem" where Whisper
 *     with `language=en` hardcoded returns garbage for Spanish audio
 *   - Cheaper per minute (~$0.0043 vs $0.006 for Whisper)
 *   - Faster processing
 *
 * Reference: https://developers.deepgram.com/reference/listen-file
 */

interface DeepgramWord {
  word: string;
  start: number;
  end: number;
  confidence: number;
}

interface DeepgramAlternative {
  transcript: string;
  confidence: number;
  words?: DeepgramWord[];
}

interface DeepgramChannel {
  detected_language?: string;
  alternatives: DeepgramAlternative[];
}

interface DeepgramResponse {
  metadata?: {
    duration?: number;
    channels?: number;
    request_id?: string;
  };
  results?: {
    channels?: DeepgramChannel[];
  };
}

export interface DeepgramTranscriptionResult {
  transcript: string;
  detectedLanguage: string | null;
  duration: number | null;
  confidence: number | null;
}

/**
 * Transcribe an audio buffer using Deepgram Nova-3 with multi-language
 * auto-detection. Returns the full transcript plus metadata.
 *
 * Throws if DEEPGRAM_API_KEY is not set or the API returns a non-OK status.
 */
export async function transcribeAudio(
  audioBuffer: ArrayBuffer
): Promise<DeepgramTranscriptionResult> {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    throw new Error("DEEPGRAM_API_KEY not set");
  }

  const url =
    "https://api.deepgram.com/v1/listen" +
    "?model=nova-3" +
    "&smart_format=true" +
    "&language=multi";

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Token ${apiKey}`,
      // Deepgram auto-detects the actual encoding regardless of the declared
      // content type, so `audio/wav` is safe even when GHL returns MP3 data
      // under a WAV mime type.
      "Content-Type": "audio/wav",
    },
    body: audioBuffer,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Deepgram API returned ${res.status}: ${text.slice(0, 300)}`
    );
  }

  const body = (await res.json()) as DeepgramResponse;
  const channel = body.results?.channels?.[0];
  const alt = channel?.alternatives?.[0];

  if (!alt || typeof alt.transcript !== "string") {
    throw new Error("Deepgram returned no transcript alternative");
  }

  return {
    transcript: alt.transcript,
    detectedLanguage: channel?.detected_language ?? null,
    duration: body.metadata?.duration ?? null,
    confidence: alt.confidence ?? null,
  };
}
