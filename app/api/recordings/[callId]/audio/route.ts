/**
 * GET /api/recordings/[callId]/audio
 *
 * Authenticated proxy that fetches a call recording from Go High Level
 * and streams it back to the browser with proper audio headers.
 *
 * ## Why a proxy?
 *
 * GHL's recording endpoint requires a Bearer token in the Authorization
 * header. Browsers can't send that from an `<audio src="…">` tag, and
 * we don't want to expose the GHL token to the client. This endpoint
 * sits in between: it authenticates the user via Supabase session
 * cookies (same-origin, set by Next.js auth), fetches the recording
 * from GHL on the server side, and returns the raw audio bytes.
 *
 * ## Caching
 *
 * Recordings are immutable content — a call's audio never changes.
 * We return `Cache-Control: private, max-age=3600, immutable` so the
 * browser caches it for 1 hour. `private` prevents CDN/Vercel edge
 * caching of auth-gated content.
 *
 * ## Buffering vs streaming
 *
 * We buffer the full response (5–30 MB typical) rather than streaming
 * because:
 *   1. `Content-Length` is required for `<audio>` element seeking.
 *   2. GHL doesn't support Range requests, so streaming would not
 *      enable seek anyway.
 *   3. Vercel serverless functions have a 50 MB response limit, and
 *      recordings are well under that.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { GHLClient } from "@/lib/ghl/client";
import {
  getGHLGlobalConfig,
  GHLNotConfiguredError,
} from "@/lib/ghl/getGlobalConfig";

export const maxDuration = 60; // GHL download can be slow for large recordings

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ callId: string }> }
) {
  const { callId } = await params;

  // ── Auth ──────────────────────────────────────────────────────
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Look up the recording (RLS-scoped to user's org) ─────────
  const { data: recording, error } = await supabase
    .from("call_recordings")
    .select("ghl_message_id")
    .eq("id", callId)
    .single();

  if (error || !recording) {
    return NextResponse.json(
      { error: "Recording not found" },
      { status: 404 }
    );
  }

  if (!recording.ghl_message_id) {
    return NextResponse.json(
      { error: "No GHL recording available for this call" },
      { status: 404 }
    );
  }

  // ── Load GHL credentials ─────────────────────────────────────
  let ghlConfig;
  try {
    ghlConfig = await getGHLGlobalConfig();
  } catch (err) {
    if (err instanceof GHLNotConfiguredError) {
      return NextResponse.json(
        { error: "GHL integration is not configured" },
        { status: 503 }
      );
    }
    throw err;
  }

  // ── Download from GHL ────────────────────────────────────────
  const ghl = new GHLClient(ghlConfig.apiToken, ghlConfig.locationId);

  let audioBuffer: ArrayBuffer;
  try {
    audioBuffer = await ghl.downloadRecording(recording.ghl_message_id);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[audio-proxy] GHL download failed for call ${callId} (messageId=${recording.ghl_message_id}):`,
      message
    );
    return NextResponse.json(
      { error: "Recording unavailable from provider" },
      { status: 502 }
    );
  }

  // ── Handle Range requests for seeking ─────────────────────────
  //
  // HTML5 `<audio>` elements only allow seeking if the server
  // advertises `Accept-Ranges: bytes`. When the user drags the
  // slider, the browser sends a `Range: bytes=N-` header and
  // expects a 206 Partial Content response. Without this, seeking
  // is silently disabled on unbuffered portions of the audio.
  //
  // We already have the full buffer from GHL, so we just slice it.
  // After the first full request, the browser caches the response
  // (Cache-Control: private, max-age=3600) and synthesizes Range
  // responses from cache — no extra GHL downloads for seeks.
  const totalBytes = audioBuffer.byteLength;
  const rangeHeader = _request.headers.get("range");

  if (rangeHeader) {
    const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
    if (match) {
      const start = parseInt(match[1]);
      const end = match[2] ? parseInt(match[2]) : totalBytes - 1;
      const clampedEnd = Math.min(end, totalBytes - 1);
      const chunk = audioBuffer.slice(start, clampedEnd + 1);

      return new NextResponse(chunk, {
        status: 206,
        headers: {
          "Content-Type": "audio/mpeg",
          "Content-Range": `bytes ${start}-${clampedEnd}/${totalBytes}`,
          "Content-Length": String(chunk.byteLength),
          "Accept-Ranges": "bytes",
          "Cache-Control": "private, max-age=3600, immutable",
        },
      });
    }
  }

  // ── Full response (initial load) ─────────────────────────────
  return new NextResponse(audioBuffer, {
    status: 200,
    headers: {
      "Content-Type": "audio/mpeg",
      "Content-Length": String(totalBytes),
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=3600, immutable",
      "Content-Disposition": "inline",
    },
  });
}
