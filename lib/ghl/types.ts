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
  fullName?: string;
  contactName?: string;
  email?: string;
  phone?: string;
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
  /** Duration in seconds for TYPE_CALL messages */
  duration?: number;
  /** Call status for TYPE_CALL messages */
  callStatus?: string;
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

export interface GHLContact {
  id: string;
  locationId: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  email?: string;
  phone?: string;
  companyName?: string;
  tags?: string[];
  customFields?: Array<{
    id: string;
    value: unknown;
    fieldKey?: string;
  }>;
  dateAdded: string;
  dateUpdated: string;
}

export interface GHLContactsResponse {
  contacts: GHLContact[];
  meta: {
    total: number;
    currentPage?: number;
    nextPage?: number;
    prevPage?: number;
    nextPageUrl?: string;
    startAfter?: number;
    startAfterId?: string;
  };
}

export interface GHLTranscriptionResponse {
  transcription?: string;
  text?: string;
  status?: string;
}

/** GHL Pipeline */
export interface GHLPipeline {
  id: string;
  name: string;
  stages: Array<{ id: string; name: string }>;
}

export interface GHLPipelinesResponse {
  pipelines: GHLPipeline[];
}

/** GHL Opportunity */
export interface GHLOpportunity {
  id: string;
  name: string;
  status: "open" | "won" | "lost" | "abandoned";
  monetaryValue: number;
  assignedTo: string;
  contact: {
    id: string;
    name: string;
    phone?: string;
    email?: string;
    companyName?: string;
  };
  pipelineId: string;
  pipelineStageId: string;
  createdAt: string;
  updatedAt: string;
}

export interface GHLOpportunitiesSearchResponse {
  opportunities: GHLOpportunity[];
  meta: {
    total: number;
    currentPage?: number;
    nextPageUrl?: string;
    startAfter?: number;
    startAfterId?: string;
  };
}

/** Represents a discovered call ready for processing */
export interface DiscoveredCall {
  messageId: string;
  conversationId: string;
  contactId: string;
  contactName: string;
  contactPhone: string;
  direction: string;
  callDate: string;
  duration: number;
  /** Closer name extracted from the contact's custom field {{contact.closer}} */
  closerName?: string;
}
