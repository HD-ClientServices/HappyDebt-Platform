# n8n Implementation Patterns for Call Recording Workflows

## Architecture Overview

The proven architecture for a GHL call recording → transcription → QA pipeline:

```
Webhook → Extract Data → Wait → Get Conversations → Get Messages → Extract Message ID
  ↓
  ├── Download Partial (?index=1) → [error] → Download Fallback (no index)
  │     ↓                                          ↓
  │     Fix WAV Header (passthrough)  ←────────────┘
  │     ↓
  │     Transcribe (Deepgram) → Extract Transcript → Build QA → OpenAI → PDF → Slack
  │
  └── Download Recording (?index=1) → [error] → Download Fallback → Upload to Drive
```

Two parallel branches: one for transcription/QA (partial or full download), one for
archiving the full recording to Drive.

## n8n Cloud Memory Constraints

### The OOM Problem

n8n cloud has limited memory per execution (~50-100 MB estimated). The most common
OOM trigger is Code nodes that load binary data:

```javascript
// THIS CAUSES OOM for files >15MB:
const buf = await this.helpers.getBinaryDataBuffer(i, 'data');  // loads into RAM
const bd = await this.helpers.prepareBinaryData(buf, 'audio.wav'); // creates copy in RAM
// Peak memory: ~2x file size
```

### Safe Patterns

**Passthrough (no memory load):**
```javascript
const items = $input.all();
return items.map(item => ({
  json: item.json,
  binary: item.binary
}));
```
This passes binary data by reference — no memory spike.

**HTTP Request nodes for downloads:** Always use HTTP Request nodes (not Code nodes)
for downloading files. HTTP Request nodes handle binary streaming more efficiently
than `this.helpers.httpRequest()` in Code nodes.

**Never use Code nodes for:**
- Downloading large audio files
- Converting audio formats
- Manipulating binary data >10MB
- Any operation that calls both `getBinaryDataBuffer` and `prepareBinaryData`

## Error Handling Patterns

### continueErrorOutput

HTTP Request nodes support `onError: "continueErrorOutput"` which routes failed
requests to a second output instead of crashing the workflow.

```
Node with continueErrorOutput:
  Output 0 (success) → next node
  Output 1 (error) → fallback node
```

**Key behaviors:**
- The error output item contains `{ error: { message: "..." } }` in its json
- The original input json fields (messageId, etc.) are NOT preserved in error output
- To pass data through error paths, use `$('NodeName')` references in downstream nodes

### Paired Item Mapping Through Error Paths

When a node receives data from an error output, `$('UpstreamNode')` references may
not resolve correctly due to broken paired item chains. This is a known n8n limitation.

**Workaround:** Use data that flows through the json of the items themselves, not
cross-node references. Or ensure the fallback node independently references the
original data source.

**What works:**
```
Download Fallback URL:
={{ $('Extract Message ID').item.json.messageId }}
```
This works because Extract Message ID is an ancestor in the execution chain and
n8n can trace back to it even through error paths of HTTP Request nodes.

**What doesn't work:**
Code node throws error → `$('Extract Message ID')` in downstream node may fail
because the Code node's error output breaks the paired item chain.

### The Ghost Connection Problem

When nodes are deleted from an n8n workflow, their connections may persist as
"ghost connections" in the JSON. This causes crashes:

```
Error: "Cannot read properties of undefined (reading 'disabled')"
```

This happens because n8n's execution engine traverses all connections and tries
to read `.disabled` on the target node. If the node was deleted but the connection
remains, it gets `undefined` and crashes instantly (30ms, before any node executes).

**Two types of ghost connections:**
1. **Source ghosts:** Deleted node name still exists as a key in `connections` object
2. **Target ghosts:** Existing node's connections point to a deleted node name

Both must be cleaned. Check all connection targets against the actual nodes array.

## Save and Reload Pattern

### Saving via Pinia Store

n8n's UI uses Vue 3 with Pinia stores. To modify workflow programmatically:

```javascript
const app = document.querySelector('#app').__vue_app__;
const pinia = app.config.globalProperties.$pinia;
const wf = pinia.state.value.workflows.workflow;

// Modify nodes, connections, etc.
wf.nodes.find(n => n.name === 'MyNode').parameters.url = 'new-url';

// Mark as dirty
pinia.state.value.ui.stateIsDirty = true;

// Click Save button
document.querySelectorAll('button').forEach(b => {
  if (b.textContent.trim() === 'Save') b.click();
});
```

### Critical: Toggle Off→On After Save

After saving workflow changes, the execution engine still uses the OLD cached version.
You MUST toggle the workflow inactive then active to force a reload:

```javascript
// Toggle OFF
document.querySelector('[data-test-id="workflow-activate-switch"] input[role="switch"]').click();
// Wait 2-3 seconds
// Toggle ON
document.querySelector('[data-test-id="workflow-activate-switch"] input[role="switch"]').click();
```

### Never Use fetch() to n8n REST API

Making `fetch()` calls to n8n's REST API from the browser console interferes with
session cookies and expires the user's login. Always use the Pinia store + DOM
interaction for modifications.

### Always Verify Persistence

After saving, reload the page and verify changes persisted. Saves via Pinia
sometimes appear successful (`dirty=false`) but don't actually persist.

## Code Node Patterns

### Dual Output from Code Nodes

n8n Code nodes v2 do NOT support `return [[], []]` for multiple outputs.
The only way to route to different outputs from a Code node is using
`onError: "continueErrorOutput"` with `throw`.

**But:** throwing loses the item data in the error output. The error output
only contains `{ error: { message: "..." } }`.

**Best practice:** Avoid using Code nodes for routing decisions. Use HTTP Request
nodes with error handling instead — they preserve data flow better.

### Regex in Code Nodes

When matching patterns in QA analysis output (markdown tables), be flexible
with whitespace:

```javascript
// BAD — breaks when table has different spacing:
/\| .+ \| (\d+)\/10 \|/g  // expects exactly 1 space before |

// GOOD — handles variable spacing:
/\| .+ \| (\d+)\/10\s*\|/g  // handles any whitespace before |
```

This matters because OpenAI's markdown output varies in column padding.

## Node Configuration Reference

### HTTP Request for Recording Download

```
Type: n8n-nodes-base.httpRequest
Version: 4.2+
Method: GET
URL: =https://services.leadconnectorhq.com/conversations/messages/{{ $json.messageId }}/locations/{{ $json.locationId }}/recording?index=1
Headers:
  - Authorization: Bearer {GHL_TOKEN}
  - Version: 2021-07-28
Response Format: file
On Error: continueErrorOutput
```

### HTTP Request for Deepgram Transcription

```
Type: n8n-nodes-base.httpRequest
Version: 4.2+
Method: POST
URL: https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&language=multi
Headers:
  - Authorization: Token {DEEPGRAM_API_KEY}
  - Content-Type: audio/wav
Body: Binary Data (field: data)
```

### Code Node for Transcript Extraction (Deepgram)

```javascript
const dg = $json;
const transcript = dg.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
return [{ json: { text: transcript } }];
```
