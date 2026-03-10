/** Go High Level API type definitions */

export interface GHLCallWebhookPayload {
  contact_id: string;
  contact_name: string;
  contact_phone: string;
  call_duration: string | number;
  business_name: string;
  closer: string;
}

export interface GHLConversation {
  id: string;
  contactId: string;
  locationId: string;
  type: string;
  unreadCount: number;
  dateAdded: string;
  dateUpdated: string;
}

export interface GHLMessage {
  id: string;
  type: number;
  messageType: string;
  direction: string;
  status: string;
  contentType: string;
  body?: string;
  dateAdded: string;
  attachments?: string[];
  meta?: Record<string, unknown>;
}

export interface GHLConversationsSearchResponse {
  conversations: GHLConversation[];
  total: number;
}

export interface GHLMessagesResponse {
  messages: {
    messages: GHLMessage[];
    nextPage?: string;
  };
}

export interface GHLUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  profilePhoto?: string;
  deleted: boolean;
}
