export type OrgPlan = "free" | "starter" | "growth" | "enterprise";
export type UserRole = "admin" | "manager" | "viewer" | "happydebt_admin";
export type LiveTransferStatus =
  | "transferred"
  | "connected"
  | "funded"
  | "declined"
  | "no_answer";
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

export interface Organization {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  plan: OrgPlan;
  trial_ends_at: string | null;
  stripe_customer_id: string | null;
  created_at: string;
  updated_at: string;
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
  status: LiveTransferStatus;
  amount: number | null;
  notes: string | null;
  created_at: string;
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
  created_at: string;
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
