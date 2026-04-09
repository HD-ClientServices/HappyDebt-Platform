---
name: ghl-call-recordings
description: >
  Expert knowledge of GoHighLevel (GHL) call recordings — how they're stored, accessed via API,
  and processed for transcription/QA analysis in n8n workflows. Use this skill whenever working with
  GHL call recordings, live transfer recordings, Twilio-backed call audio, recording download APIs,
  or building call QA/analysis pipelines. Trigger when the user mentions "call recording", "GHL recording",
  "live transfer audio", "closer recording", "setter recording", "recording index", "call QA",
  "transcribe calls", "Deepgram", "Whisper transcription", or any question about downloading, selecting,
  or processing call recordings from GoHighLevel. Also trigger for n8n workflows that handle call audio,
  binary file processing in n8n cloud, or audio transcription pipelines. This skill complements the
  ghl-api skill — use both together when the user needs to build or debug call recording workflows.
---

# GHL Call Recordings — Expert Knowledge

This skill contains hard-won knowledge about how GoHighLevel stores and serves call recordings,
how to correctly select and download them (especially for live-transferred calls), and how to
build robust transcription/QA pipelines in n8n cloud.

This knowledge was developed through extensive real-world debugging across dozens of contact
scenarios including simple calls, multi-call conversations, live transfers, Spanish-language
calls, and edge cases with missing metadata.

## Quick Reference: The Recording Download Pattern

The correct, battle-tested pattern for downloading GHL call recordings:

```
1. Get conversation messages → filter TYPE_CALL + completed
2. Select the best call (longest duration, null treated as potentially longest)
3. Try downloading with ?index=1 first (gets closer recording for transfers)
4. If ?index=1 fails (422) → fall back to no index (gets default recording)
5. Send to transcription service (Deepgram recommended over Whisper for large files)
```

For full technical details, see `references/recording-api.md`.
For n8n implementation patterns, see `references/n8n-patterns.md`.
For transcription service comparison, see `references/transcription.md`.

## When to Read Which Reference

| Question | Read |
|----------|------|
| How does GHL's recording API work? What does `?index=` mean? | `references/recording-api.md` |
| How do I build this in n8n? What about OOM? Error handling? | `references/n8n-patterns.md` |
| Whisper vs Deepgram? File size limits? Language detection? | `references/transcription.md` |
| How does call selection work for different scenarios? | `references/recording-api.md` §Call Selection |

## Critical Rules (from painful experience)

1. **`?index=` is per-message, NOT per-conversation.** Index 0 = setter/default recording, Index 1 = closer recording. Values above 1 are almost never valid.

2. **`selectedIndex` (position in array) ≠ recording API `?index=`.** These are completely different concepts. Never use array position as the recording index.

3. **Never process large audio binaries in n8n Code nodes.** `getBinaryDataBuffer` + `prepareBinaryData` causes OOM on n8n cloud for files >15MB. Use HTTP Request nodes for binary operations.

4. **GHL's `meta.call.duration` can be `null` for long calls.** Treat null as potentially the longest call, not as zero.

5. **GHL only records the setter leg for some live transfers.** The closer leg may not be available at any index. This is a GHL platform limitation.

6. **Always toggle n8n workflows off→on after saving changes** to force the execution engine to reload.
