# GHL Call Recording API — Deep Technical Reference

## Recording Download Endpoint

```
GET /conversations/messages/{messageId}/locations/{locationId}/recording
Optional: ?index={N}
Headers:
  Authorization: Bearer {GHL_TOKEN}
  Version: 2021-07-28
```

This endpoint is **undocumented** in GHL's official API docs. It was discovered through
reverse-engineering the GHL UI and trial-and-error testing.

## The `?index=` Parameter

This is the most misunderstood parameter in GHL's recording system.

### What `?index=` means

- `?index=0` or no index → **Default recording** (usually the setter/first leg)
- `?index=1` → **Second recording** (usually the closer leg in a live transfer)
- `?index=2+` → Almost never valid. Returns 422 "Message does not have recording"

### What `?index=` does NOT mean

- It is NOT the position of the call in the conversation's message array
- It is NOT related to `selectedIndex` from filtering completed calls
- It is NOT a conversation-wide recording counter

### Per-message, not per-conversation

Each TYPE_CALL message can have 0, 1, or 2 recordings. The `?index=` selects
which recording within that specific message. A conversation with 7 calls still
has each call's recordings accessed individually by message ID + index.

## Call Message Structure

GHL call messages are retrieved via:
```
GET /conversations/{conversationId}/messages
```

Response structure:
```json
{
  "messages": {
    "lastMessageId": "...",
    "nextPage": "...",
    "messages": [
      {
        "id": "messageId",
        "messageType": "TYPE_CALL",
        "status": "completed",
        "direction": "outbound",
        "dateAdded": "2026-03-04T17:44:08.000Z",
        "meta": {
          "call": {
            "duration": 1261,
            "status": "completed"
          }
        },
        "altId": "CA79ee4b66...",  // Twilio Call SID
        "source": "app",
        "contactId": "...",
        "conversationId": "...",
        "locationId": "..."
      }
    ]
  }
}
```

### Key fields

| Field | Description |
|-------|-------------|
| `messageType` | `TYPE_CALL` for calls. Other types: `TYPE_SMS`, `TYPE_CAMPAIGN_CALL`, `TYPE_ACTIVITY_OPPORTUNITY` |
| `status` | `completed`, `no-answer`, `failed`, `connected`, etc. Filter for `completed` |
| `meta.call.duration` | Duration in seconds. **CAN BE NULL** even for long calls |
| `meta.call.status` | Usually mirrors `status` field |
| `altId` | Twilio Call SID (format: `CA` + 32 hex chars). Useful for Twilio API access if needed |
| `direction` | `inbound` or `outbound` |
| `dateAdded` | ISO 8601 timestamp of when the call occurred |

### The `duration: null` problem

GHL sometimes fails to populate `meta.call.duration` for completed calls, especially:
- Live-transferred calls where the inbound leg is the main call
- Very long calls (50+ minutes observed)
- Calls that involve multiple transfers

**Never treat null duration as 0.** In practice, null-duration calls are often the LONGEST
and most important calls. Treat null as potentially infinite when sorting/selecting.

## Call Selection Algorithm

The correct algorithm for selecting which call to analyze:

```javascript
// 1. Filter completed calls
const completedCalls = messages.filter(
  m => m.messageType === 'TYPE_CALL' && m.status === 'completed'
);

// 2. Sort: longest first, null treated as Infinity, newest as tiebreaker
completedCalls.sort((a, b) => {
  const durA = a.meta?.call?.duration ?? Infinity;
  const durB = b.meta?.call?.duration ?? Infinity;
  if (durB !== durA) return durB - durA;
  return (b.dateAdded || '').localeCompare(a.dateAdded || '');
});

// 3. Take the first (longest/null)
const selectedCall = completedCalls[0];
```

### Why "longest" works (most of the time)

In B2B sales scenarios with setter→closer live transfers:
- Setter calls are typically 1-7 seconds (handoff to closer)
- Closer calls are 10-50+ minutes (the real conversation)
- Picking the longest consistently gets the closer's call

### Edge cases

| Scenario | Calls | Duration behavior | Selection |
|----------|-------|-------------------|-----------|
| Simple call (no transfer) | 1 completed | Valid duration | Only option |
| Setter + closer | 2 completed | Short (setter) + long (closer) | Longest = closer ✓ |
| Multiple attempts + closer | 3-7 completed | Mix of short + one long | Longest = closer ✓ |
| Long call, null duration | 1-2 completed | One has null | Null → Infinity → selected ✓ |
| Only setter recorded | 1 completed | Short with valid duration | Only option (GHL limitation) |

## Recording Download Pattern

### The two-step download strategy

```
Step 1: Try ?index=1 (closer recording)
  ├── Success → Use this recording (it's the closer/full recording)
  └── 422 error → Step 2

Step 2: Download without ?index= (default recording)
  ├── Success → Use this recording (simple call, no transfer)
  └── 422 error → No recording available
```

### Why index=1 first?

For live-transferred calls, index=0 returns the setter's recording (typically 1-3 minutes),
while index=1 returns the closer's recording (the full conversation). By trying index=1 first:
- Transfers: gets the closer recording directly ✓
- Simple calls: index=1 fails (422) → fallback gets the only recording ✓

### File sizes and formats

| Recording type | Typical size | Format |
|----------------|-------------|--------|
| Setter leg (1-3 min) | 1-3 MB | audio/x-wav (actually compressed) |
| Closer leg (10-30 min) | 10-30 MB | audio/x-wav (actually compressed) |
| Full call (no transfer) | 5-25 MB | audio/x-wav (actually compressed) |
| Long call (45+ min) | 40-50 MB | audio/x-wav (actually compressed) |

GHL returns recordings with MIME type `audio/x-wav` and filename extension `.mp3`.
The actual encoding is compressed (not raw PCM WAV). At approximately 0.96 MB/min for
normal quality phone recordings.

### Size validation formula

To check if a recording seems complete:
```
expectedMinSize = (durationSeconds / 60) * 0.3 * 1024 * 1024  // 0.3 MB/min minimum
```

If `actualSize < expectedMinSize`, the recording is likely only the setter leg.

## GHL Webhook Payload

When GHL triggers a webhook for "Call Completed":

```json
{
  "contact_id": "E1MgV6JN4fFzOGCt5DTw",
  "contact_name": "Nick Ceci",
  "contact_phone": "(678) 516-0594",
  "call_duration": "",
  "business_name": "Ceci Remodeling Services",
  "closer": "null"
}
```

**Important:** `call_duration` is often empty string for transferred calls.
`closer` may be the string `"null"` (not actual null). These fields are unreliable
for transferred calls — always fetch the actual call data from the messages API.

## GHL Platform Limitations

### Setter-only recordings

For some live-transferred calls, GHL only stores the setter leg's recording.
The closer leg is not accessible via any index (0, 1, 2, 3 all return 422).
This is visible in GHL's UI: the call shows a long duration but the recording
is only 2-3 minutes.

**There is no workaround via the GHL API.** The recording simply isn't stored.
Options:
1. Configure GHL phone settings to record both legs
2. Access Twilio directly using the `altId` (Call SID) from the message
3. Accept partial recording and note it in the QA report

### Range header behavior

GHL's recording API sometimes ignores the `Range` HTTP header. Files may be
returned at full size regardless of the Range specified. Do not rely on Range
for size limiting — handle large files at the application level.
