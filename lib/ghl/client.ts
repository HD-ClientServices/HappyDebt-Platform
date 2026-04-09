/**
 * Go High Level API Client
 * Wraps GHL REST API with typed methods for conversations, contacts, recordings, and transcriptions.
 */

import type {
  GHLConversationsSearchResponse,
  GHLMessagesResponse,
  GHLMessage,
  GHLUser,
  GHLContactsResponse,
  GHLContact,
  GHLPipeline,
  GHLPipelinesResponse,
  GHLOpportunitiesResponse,
  GHLOpportunity,
  GHLCustomField,
  DiscoveredCall,
} from "./types";

const GHL_BASE_URL = "https://services.leadconnectorhq.com";

export class GHLClient {
  private token: string;
  private locationId: string;

  constructor(token: string, locationId: string) {
    this.token = token;
    this.locationId = locationId;
  }

  /**
   * Low-level request helper with automatic retry on HTTP 429
   * (Too Many Requests).
   *
   * GHL's rate limit is roughly 120 requests per minute per API token.
   * The sync pipeline can easily burst past that when it runs
   * `discoverRecentCalls()` (which fans out per conversation) in
   * parallel with the per-contact custom field fetch. We handle 429s
   * here rather than in each caller so every GHL method benefits
   * uniformly.
   *
   * Retry policy: up to 3 attempts, exponential backoff starting at
   * 1 second (1s → 2s → 4s). After the last attempt the original
   * error is thrown so callers can surface it.
   */
  private async request<T>(
    endpoint: string,
    method = "GET",
    body?: unknown
  ): Promise<T> {
    const url = `${GHL_BASE_URL}${endpoint}`;
    const MAX_ATTEMPTS = 3;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${this.token}`,
          Version: "2021-07-28",
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      if (res.ok) {
        return res.json() as Promise<T>;
      }

      // Retry on 429 (rate limit). Everything else fails fast.
      if (res.status === 429 && attempt < MAX_ATTEMPTS) {
        const backoffMs = 1000 * Math.pow(2, attempt - 1); // 1s, 2s, 4s
        console.warn(
          `[GHL] 429 on ${method} ${endpoint} — retrying in ${backoffMs}ms (attempt ${attempt}/${MAX_ATTEMPTS})`
        );
        await new Promise((r) => setTimeout(r, backoffMs));
        continue;
      }

      const errorText = await res.text();
      throw new Error(`GHL API Error ${res.status}: ${errorText}`);
    }

    // Unreachable — the loop either returns on success or throws on the
    // last failed attempt. TypeScript needs this for control-flow.
    throw new Error(`GHL API Error: exhausted ${MAX_ATTEMPTS} retries on ${endpoint}`);
  }

  /**
   * Download recording as binary buffer using the closer-first strategy.
   *
   * For live-transferred calls, GHL stores two recordings per message:
   *   - index=0 (default): setter's leg (1-3 min, the handoff)
   *   - index=1: closer's leg (10-30+ min, the real conversation)
   *
   * We try index=1 first. If it returns 422 ("no recording at that
   * index"), the call was a simple one (no transfer) and we fall back
   * to the default recording. This pattern is documented in
   * `docs/skills/ghl-call-recordings/references/recording-api.md`.
   */
  async downloadRecording(messageId: string): Promise<ArrayBuffer> {
    const baseUrl = `${GHL_BASE_URL}/conversations/messages/${messageId}/locations/${this.locationId}/recording`;
    const headers = {
      Authorization: `Bearer ${this.token}`,
      Version: "2021-07-28",
      Accept: "*/*",
    };

    // Step 1: Try index=1 (closer's recording in a live transfer)
    try {
      const closerRes = await fetch(`${baseUrl}?index=1`, { headers });
      if (closerRes.ok) {
        console.log(
          `[GHL] Downloaded closer recording (index=1) for message ${messageId}`
        );
        return closerRes.arrayBuffer();
      }
      // 422 = no recording at index 1 → fall through to default
    } catch {
      // Network error on index=1 attempt → fall through
    }

    // Step 2: Fall back to default recording (index=0, simple call or setter-only)
    const res = await fetch(baseUrl, { headers });
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`GHL Recording Download Error ${res.status}: ${errorText}`);
    }

    console.log(
      `[GHL] Downloaded default recording (index=0) for message ${messageId}`
    );
    return res.arrayBuffer();
  }

  /** Get transcription from GHL's built-in transcription service */
  async getTranscription(messageId: string): Promise<string | null> {
    try {
      const url = `${GHL_BASE_URL}/conversations/locations/${this.locationId}/messages/${messageId}/transcription`;
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${this.token}`,
          Version: "2021-07-28",
          Accept: "application/json",
        },
      });

      if (!res.ok) return null;

      const data = await res.json();
      // GHL may return transcription in different fields
      return data.transcription || data.text || null;
    } catch {
      return null;
    }
  }

  /** Search conversations for a given contact */
  async searchConversations(contactId: string, limit = 5): Promise<GHLConversationsSearchResponse> {
    return this.request(
      `/conversations/search?locationId=${this.locationId}&contactId=${contactId}&limit=${limit}`
    );
  }

  /**
   * Search ALL recent conversations for the location.
   * Uses pagination to retrieve up to maxResults conversations.
   */
  async searchAllConversations(limit = 50): Promise<GHLConversationsSearchResponse> {
    return this.request(
      `/conversations/search?locationId=${this.locationId}&limit=${limit}&sort=desc&sortBy=last_message_date`
    );
  }

  /** Get messages from a conversation */
  async getMessages(conversationId: string, limit = 50): Promise<GHLMessagesResponse> {
    return this.request(
      `/conversations/${conversationId}/messages?limit=${limit}&sort=desc`
    );
  }

  /**
   * Find the best completed call message for a contact.
   *
   * Collects ALL completed calls across all of the contact's
   * conversations and picks the **longest** one (duration desc, null
   * treated as Infinity — per the algorithm documented in
   * `docs/skills/ghl-call-recordings/references/recording-api.md`).
   *
   * In a setter→closer live transfer scenario, a conversation will
   * contain a short setter call (1-7s) and a long closer call (10-30+
   * min). Picking the longest consistently returns the closer's call,
   * which is the one we want for QA analysis.
   */
  async findCompletedCallMessage(
    contactId: string
  ): Promise<{ message: GHLMessage; conversationId: string } | null> {
    const convData = await this.searchConversations(contactId);
    if (!convData.conversations || convData.conversations.length === 0) {
      return null;
    }

    const allCalls: { message: GHLMessage; conversationId: string }[] = [];

    for (const conv of convData.conversations) {
      const msgData = await this.getMessages(conv.id);
      const messages = msgData.messages?.messages || msgData.messages || [];

      for (const msg of messages as GHLMessage[]) {
        if (msg.messageType === "TYPE_CALL" && msg.status === "completed") {
          allCalls.push({ message: msg, conversationId: conv.id });
        }
      }
    }

    if (allCalls.length === 0) return null;

    // Sort: longest first. Null duration → Infinity (often the most
    // important call — see recording-api.md "The duration: null problem").
    allCalls.sort((a, b) => {
      const durA = getCallDuration(a.message);
      const durB = getCallDuration(b.message);
      if (durB !== durA) return durB - durA;
      // Tiebreaker: newest first
      return (b.message.dateAdded || "").localeCompare(
        a.message.dateAdded || ""
      );
    });

    return allCalls[0];
  }

  /** Get GHL users (for closer sync) */
  async getUsers(): Promise<GHLUser[]> {
    const data = await this.request<{ users: GHLUser[] }>(
      `/users/?locationId=${this.locationId}`
    );
    return data.users || [];
  }

  /** Get contacts with optional tag filter and pagination */
  async getContacts(
    limit = 20,
    page = 1,
    query?: string
  ): Promise<GHLContactsResponse> {
    let url = `/contacts/?locationId=${this.locationId}&limit=${limit}&page=${page}`;
    if (query) url += `&query=${encodeURIComponent(query)}`;
    return this.request<GHLContactsResponse>(url);
  }

  /** Get a single contact by ID */
  async getContact(contactId: string): Promise<GHLContact | null> {
    try {
      const data = await this.request<{ contact: GHLContact }>(
        `/contacts/${contactId}`
      );
      return data.contact || null;
    } catch {
      return null;
    }
  }

  /**
   * List every custom field defined on the current location — contact,
   * opportunity, and business fields all come back in the same list.
   * Used by the sync to resolve the `contact.closer` field id once per
   * run, then look up closer names from each contact's `customFields`
   * array (which identifies fields by id, not by fieldKey).
   *
   * Returns an empty array on any error so callers can fall back to
   * a null `closer_id` without blowing up the whole sync.
   */
  async getCustomFields(): Promise<GHLCustomField[]> {
    try {
      const data = await this.request<{ customFields: GHLCustomField[] }>(
        `/locations/${this.locationId}/customFields`
      );
      return data.customFields ?? [];
    } catch {
      return [];
    }
  }

  /**
   * Update the status of a GHL opportunity via the dedicated
   * `PUT /opportunities/{id}/status` endpoint.
   *
   * Valid status values per the GHL API docs (see
   * `docs/skills/ghl-api/references/opportunities.md`):
   *   - `open`      — in progress
   *   - `won`       — deal closed successfully
   *   - `lost`      — deal lost
   *   - `abandoned` — lead ghosted / no response
   *
   * Note: `disqualified` is NOT a valid GHL status value. In GHL,
   * disqualified leads live in a closing-pipeline stage named
   * something like "DQ Lead" — the sync code detects it by matching
   * the stage name. This helper does NOT handle moving opps to
   * specific stages; for that use `PUT /opportunities/{id}` with
   * `pipelineStageId` instead.
   *
   * Throws `GHL API Error N: ...` on failure (through the shared
   * request() helper with its retry-on-429 behavior). Callers should
   * catch and surface the error to the user.
   */
  async updateOpportunityStatus(
    opportunityId: string,
    status: "open" | "won" | "lost" | "abandoned"
  ): Promise<void> {
    await this.request(
      `/opportunities/${opportunityId}/status`,
      "PUT",
      { status }
    );
  }

  /** Get all pipelines for this location */
  async getPipelines(): Promise<GHLPipeline[]> {
    const data = await this.request<GHLPipelinesResponse>(
      `/opportunities/pipelines?locationId=${this.locationId}`
    );
    return data.pipelines || [];
  }

  /** Search opportunities filtered by pipeline and optionally by status */
  async searchOpportunities(
    pipelineId: string,
    opts?: { status?: string; startAfter?: string; startAfterId?: string }
  ): Promise<GHLOpportunitiesResponse> {
    let url = `/opportunities/search?location_id=${this.locationId}&pipeline_id=${pipelineId}&limit=100`;
    if (opts?.status) url += `&status=${opts.status}`;
    if (opts?.startAfter) url += `&startAfter=${opts.startAfter}`;
    if (opts?.startAfterId) url += `&startAfterId=${opts.startAfterId}`;
    return this.request<GHLOpportunitiesResponse>(url);
  }

  /**
   * Fetch ALL opportunities from a pipeline (handles cursor-based
   * pagination internally). Optionally filter by status.
   *
   * Use this when you need the full set in one call (e.g., to build a
   * Map for cross-pipeline matching). For Rise's CLOSING PIPELINE this
   * is ~141 opps, manageable in a single sync.
   */
  async getAllOpportunities(
    pipelineId: string,
    opts?: { status?: string }
  ): Promise<GHLOpportunity[]> {
    const all: GHLOpportunity[] = [];
    let startAfter: string | undefined;
    let startAfterId: string | undefined;
    let hasMore = true;
    let safety = 0;

    while (hasMore && safety < 100) {
      safety++;
      const res = await this.searchOpportunities(pipelineId, {
        status: opts?.status,
        startAfter,
        startAfterId,
      });
      const batch = res.opportunities || [];
      all.push(...batch);

      // GHL signals end of pagination by omitting nextPageUrl OR returning
      // an empty batch.
      if (
        batch.length === 0 ||
        !res.meta?.nextPageUrl ||
        !res.meta.startAfter ||
        !res.meta.startAfterId
      ) {
        hasMore = false;
      } else {
        startAfter = res.meta.startAfter;
        startAfterId = res.meta.startAfterId;
      }
    }

    return all;
  }

  /**
   * Discover all completed calls from recent conversations.
   * This is the main method for bulk-syncing calls from GHL.
   *
   * Strategy:
   * 1. Fetch recent conversations
   * 2. For each conversation, check messages for TYPE_CALL with status=completed
   * 3. Return list of discovered calls with metadata
   */
  async discoverRecentCalls(maxConversations = 100): Promise<DiscoveredCall[]> {
    const discovered: DiscoveredCall[] = [];

    // Fetch conversations in batches
    const batchSize = 50;
    const batches = Math.ceil(maxConversations / batchSize);

    for (let i = 0; i < batches; i++) {
      const limit = Math.min(batchSize, maxConversations - i * batchSize);
      const convData = await this.searchAllConversations(limit);

      if (!convData.conversations || convData.conversations.length === 0) break;

      for (const conv of convData.conversations) {
        try {
          const msgData = await this.getMessages(conv.id, 20);
          const messages = msgData.messages?.messages || msgData.messages || [];

          // Collect all completed calls in this conversation, then
          // pick only the LONGEST one. In a setter→closer scenario
          // there are 2+ calls per conversation — the setter's (1-7s)
          // and the closer's (10-30+ min). The old code pushed every
          // call, so the setter's job could be processed first and the
          // closer's would be discarded as "duplicate_conversation".
          const completedCalls = (messages as GHLMessage[]).filter(
            (m) => m.messageType === "TYPE_CALL" && m.status === "completed"
          );

          if (completedCalls.length === 0) continue;

          // Sort: longest first (null duration = Infinity)
          completedCalls.sort((a, b) => {
            const durA = getCallDuration(a);
            const durB = getCallDuration(b);
            if (durB !== durA) return durB - durA;
            return (b.dateAdded || "").localeCompare(a.dateAdded || "");
          });

          const best = completedCalls[0];
          const contactName =
            conv.fullName || conv.contactName || "Unknown";
          const contactPhone = conv.phone || "";

          discovered.push({
            messageId: best.id,
            conversationId: conv.id,
            contactId: conv.contactId,
            contactName,
            contactPhone,
            direction: best.direction || "inbound",
            callDate: best.dateAdded,
            duration: getCallDuration(best),
            assignedUser: undefined,
          });
        } catch (err) {
          // Skip conversations that fail (deleted contacts, etc.)
          console.warn(
            `[GHL] Skipping conversation ${conv.id}:`,
            err instanceof Error ? err.message : String(err)
          );
        }
      }

      // If we got fewer conversations than the limit, we've reached the end
      if (convData.conversations.length < limit) break;
    }

    return discovered;
  }
}

// ── Helpers ─────────────────────────────────────────────────────────

/**
 * Extract the call duration from a GHL message, treating null/missing
 * as Infinity. The GHL API sometimes fails to populate
 * `meta.call.duration` for completed calls — especially live-transferred
 * or very long ones. Per the skill doc, null-duration calls are often
 * the LONGEST and most important, so we treat them as highest priority.
 *
 * Checks both `meta.call.duration` (nested in the response JSON) and
 * the top-level `duration` field (used by `discoverRecentCalls`).
 */
function getCallDuration(msg: GHLMessage): number {
  // meta.call.duration is the canonical location in the GHL response
  const metaDur = (msg.meta as { call?: { duration?: number } } | undefined)
    ?.call?.duration;
  if (typeof metaDur === "number") return metaDur;

  // Some code paths populate `msg.duration` directly
  if (typeof msg.duration === "number" && msg.duration > 0) return msg.duration;

  // Null/missing → treat as Infinity so it sorts first
  return Infinity;
}
