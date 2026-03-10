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

  private async request<T>(endpoint: string, method = "GET", body?: unknown): Promise<T> {
    const url = `${GHL_BASE_URL}${endpoint}`;
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

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`GHL API Error ${res.status}: ${errorText}`);
    }

    return res.json() as Promise<T>;
  }

  /** Download recording as binary buffer */
  async downloadRecording(messageId: string): Promise<ArrayBuffer> {
    const url = `${GHL_BASE_URL}/conversations/messages/${messageId}/locations/${this.locationId}/recording`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.token}`,
        Version: "2021-07-28",
        Accept: "*/*",
      },
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`GHL Recording Download Error ${res.status}: ${errorText}`);
    }

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

  /** Find the completed call message from a conversation */
  async findCompletedCallMessage(
    contactId: string
  ): Promise<{ message: GHLMessage; conversationId: string } | null> {
    const convData = await this.searchConversations(contactId);
    if (!convData.conversations || convData.conversations.length === 0) {
      return null;
    }

    for (const conv of convData.conversations) {
      const msgData = await this.getMessages(conv.id);
      const messages = msgData.messages?.messages || msgData.messages || [];

      const callMsg = (messages as GHLMessage[]).find(
        (m) => m.messageType === "TYPE_CALL" && m.status === "completed"
      );

      if (callMsg) {
        return { message: callMsg, conversationId: conv.id };
      }
    }

    return null;
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

          for (const msg of messages as GHLMessage[]) {
            if (msg.messageType === "TYPE_CALL" && msg.status === "completed") {
              // Get contact info from the conversation or fetch it
              const contactName =
                conv.fullName || conv.contactName || "Unknown";
              const contactPhone = conv.phone || "";

              discovered.push({
                messageId: msg.id,
                conversationId: conv.id,
                contactId: conv.contactId,
                contactName,
                contactPhone,
                direction: msg.direction || "inbound",
                callDate: msg.dateAdded,
                duration: msg.duration || 0,
                assignedUser: undefined,
              });
            }
          }
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
