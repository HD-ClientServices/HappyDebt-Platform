export type OrgPlan = "free" | "starter" | "growth" | "enterprise";
export type UserRole = "admin" | "manager" | "viewer" | "intro_admin";
export type LiveTransferStatus =
  | "transferred"
  | "connected"
  | "funded"
  | "declined"
  | "no_answer";
export type LeadSource = "intro" | "client_upload" | "ghl_sync";
export type LeadStatus = "in_sequence" | "transferred" | "closed_won";
export type ActionableSourceType =
  | "call_review"
  | "closer_profile"
  | "overview"
  | "suggestion"
  | "manual";
export type ActionablePriority = "urgent" | "high" | "medium" | "low";
export type ActionableStatus =
  | "pending"
  | "in_progress"
  | "done"
  | "dismissed";

export type ProcessingJobStatus = "pending" | "processing" | "completed" | "failed";
export type ProcessingStatus = "pending" | "transcribing" | "analyzing" | "completed" | "failed";

export interface Organization {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  plan: OrgPlan;
  trial_ends_at: string | null;
  stripe_customer_id: string | null;
  // GHL credentials (api_token, location_id, reconnect_webhook_url) live
  // in the singleton `ghl_integration` table (migration 00015) — one GHL
  // account for the entire platform. See lib/ghl/getGlobalConfig.ts.
  //
  // The per-org pipeline IDs below were dropped in 00015 and re-added
  // in 00016 when we realized each client org has its own opening /
  // closing pipeline inside the shared GHL account. Routing by pipeline
  // ID is how the sync route distinguishes which org owns a live
  // transfer.
  ghl_opening_pipeline_id: string | null;
  ghl_closing_pipeline_id: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Singleton row in `public.ghl_integration` (one for the whole platform).
 * See migration 00015_unify_ghl_integration.sql for the why.
 *
 * The `opening_pipeline_id` and `closing_pipeline_id` columns are still
 * in the physical table (00016 didn't drop them) but they're deprecated —
 * the canonical source is now `organizations.ghl_*_pipeline_id`. A
 * future migration will drop them from the singleton.
 */
export interface GHLIntegrationConfig {
  /** Always `true` — singleton enforced by CHECK on the boolean PK. */
  id: true;
  api_token: string | null;
  location_id: string | null;
  /** @deprecated since migration 00016 — use `Organization.ghl_opening_pipeline_id`. */
  opening_pipeline_id: string | null;
  /** @deprecated since migration 00016 — use `Organization.ghl_closing_pipeline_id`. */
  closing_pipeline_id: string | null;
  reconnect_webhook_url: string | null;
  updated_at: string;
  updated_by: string | null;
}

export interface User {
  id: string;
  org_id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role: UserRole;
  last_active_at: string | null;
  onboarding_completed: boolean;
  created_at: string;
}

export interface Closer {
  id: string;
  org_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  active: boolean;
  created_at: string;
}

export interface LiveTransfer {
  id: string;
  org_id: string;
  closer_id: string | null;
  lead_name: string;
  lead_phone: string | null;
  lead_email: string | null;
  business_name: string | null;
  transfer_date: string;
  status_change_date: string | null;
  status: LiveTransferStatus;
  /** pending_to_close | closed_won | closed_lost | disqualified */
  closing_status: string | null;
  amount: number | null;
  notes: string | null;
  /** GHL opening pipeline opp id (the one we iterate during sync). */
  ghl_opportunity_id: string | null;
  /**
   * GHL closing pipeline opp id — captured during sync from the
   * cross-match by contact_id. Populated on the next sync run after
   * migration 00017. Required by the edit-status endpoint.
   */
  ghl_closing_opportunity_id: string | null;
  ghl_contact_id: string | null;
  created_at: string;
}

export interface Lead {
  id: string;
  org_id: string;
  closer_id: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  business_name: string | null;
  source: LeadSource;
  ghl_contact_id: string | null;
  ghl_opportunity_id: string | null;
  status: LeadStatus;
  amount: number | null;
  transfer_date: string | null;
  closed_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeadWithCalls extends Lead {
  call_recordings: CallRecording[];
  closer?: Closer;
}

export interface EvaluationCriteria {
  name: string;
  description: string;
  weight: number;
  max_score: number;
}

export interface CallRecording {
  id: string;
  org_id: string;
  closer_id: string;
  live_transfer_id: string | null;
  lead_id: string | null;
  evaluation_template_id: string | null;
  recording_url: string;
  duration_seconds: number | null;
  call_date: string;
  transcript: string | null;
  ai_analysis: Record<string, unknown> | null;
  sentiment_score: number | null;
  evaluation_score: number | null;
  strengths: string[] | null;
  improvement_areas: string[] | null;
  is_critical: boolean;
  critical_action_plan: string | null;
  processing_status: ProcessingStatus;
  ghl_message_id: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  business_name: string | null;
  created_at: string;
}

export interface ProcessingJob {
  id: string;
  org_id: string;
  status: ProcessingJobStatus;
  job_type: "call_analysis" | "manual_sync";
  payload: Record<string, unknown>;
  result: Record<string, unknown> | null;
  call_recording_id: string | null;
  attempts: number;
  max_attempts: number;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface EvaluationTemplate {
  id: string;
  org_id: string;
  name: string;
  is_active: boolean;
  criteria: EvaluationCriteria[];
  created_at: string;
  updated_at: string;
}

export interface Actionable {
  id: string;
  org_id: string;
  user_id: string;
  title: string;
  description: string | null;
  source_type: ActionableSourceType | null;
  source_id: string | null;
  priority: ActionablePriority;
  status: ActionableStatus;
  due_date: string | null;
  assigned_to: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface PlgEvent {
  id: string;
  org_id: string;
  user_id: string | null;
  event_name: string;
  event_properties: Record<string, unknown> | null;
  session_id: string | null;
  created_at: string;
}

export interface FeatureUsage {
  id: string;
  org_id: string;
  user_id: string;
  feature_key: string;
  usage_count: number;
  first_used_at: string;
  last_used_at: string;
}
