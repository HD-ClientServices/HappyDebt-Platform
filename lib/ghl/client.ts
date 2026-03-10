/**
 * Go High Level API Client
 * Wraps GHL REST API with typed methods.
 */

import type {
  GHLConversationsSearchResponse,
  GHLMessagesResponse,
  GHLMessage,
  GHLUser,
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

  /** Search conversations for a given contact */
  async searchConversations(contactId: string, limit = 5): Promise<GHLConversationsSearchResponse> {
    return this.request(
      `/conversations/search?locationId=${this.locationId}&contactId=${contactId}&limit=${limit}`
    );
  }

  /** Get messages from a conversation */
  async getMessages(conversationId: string, limit = 50): Promise<GHLMessagesResponse> {
    return this.request(
      `/conversations/${conversationId}/messages?limit=${limit}&sort=desc`
    );
  }

  /** Find the completed call message from a conversation */
  async findCompletedCallMessage(contactId: string): Promise<{ message: GHLMessage; conversationId: string } | null> {
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
}
