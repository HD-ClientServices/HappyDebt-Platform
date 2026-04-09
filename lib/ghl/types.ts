/** Go High Level API type definitions */

export interface GHLCallWebhookPayload {
  contact_id: string;
  contact_name: string;
  contact_phone: string;
  call_duration: string | number;
  business_name: string;
  closer: string;
  /**
   * Optional pipeline id carried by newer GHL webhook payloads.
   * When present, the webhook handler uses it to route the call to
   * the org that owns that pipeline (`organizations.ghl_opening_pipeline_id`
   * or `ghl_closing_pipeline_id`). When absent, the handler falls back
   * to the single-configured-org path.
   */
  pipeline_id?: string;
  /** Alias for pipeline_id — some GHL payloads use this casing. */
  pipelineId?: string;
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
    currentPage: number;
    nextPage?: number;
    prevPage?: number;
    nextPageUrl?: string;
  };
}

export interface GHLTranscriptionResponse {
  transcription?: string;
  text?: string;
  status?: string;
}

export interface GHLPipeline {
  id: string;
  name: string;
  stages: Array<{ id: string; name: string }>;
}

export interface GHLPipelinesResponse {
  pipelines: GHLPipeline[];
}

export interface GHLOpportunity {
  id: string;
  name?: string;
  /** open | won | lost | abandoned */
  status: string;
  monetaryValue?: number;
  assignedTo?: string;
  pipelineId?: string;
  pipelineStageId?: string;
  /** Top-level contact id (also available nested under .contact.id) */
  contactId?: string;
  source?: string;
  contact?: {
    id?: string;
    name?: string;
    phone?: string;
    email?: string;
    companyName?: string;
  };
  createdAt: string;
  updatedAt?: string;
  /** When the opp's status (open/won/lost) last changed — verified via curl. */
  lastStatusChangeAt?: string;
  /** When the opp's stage last changed — verified via curl. */
  lastStageChangeAt?: string;
  effectiveProbability?: number;
}

export interface GHLOpportunitiesResponse {
  opportunities: GHLOpportunity[];
  meta?: {
    total?: number;
    nextPageUrl?: string;
    startAfter?: string;
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
  /** GHL user who handled the call, if identifiable */
  assignedUser?: string;
}
