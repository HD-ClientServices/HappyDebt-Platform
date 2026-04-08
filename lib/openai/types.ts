/** OpenAI QA Analysis type definitions */

// ── Legacy V1 types (Claude-based good/partial/missed) ─────────────
// Kept for backward-compat with existing ai_analysis rows and
// lib/anthropic/client.ts which still references them.

export type CriterionScore = "good" | "partial" | "missed";

export interface CriterionResult {
  name: string;
  score: CriterionScore;
  client_quotes: string[];
  rep_quotes: string[];
  feedback: string;
}

export type OverallScore = "green" | "yellow" | "red";

export interface QAAnalysisResult {
  criteria: CriterionResult[];
  overall: OverallScore;
  good_count: number;
  partial_count: number;
  missed_count: number;
  total_issues: string;
  raw_analysis: string;
}

// ── V2 types (GPT-4o with 5-pillar 1-10 scoring) ──────────────────
// Replicates the output of the user's N8N workflow
// `Rise Alliance - Call QA Analyzer`. This is the active production type.

export type PillarLevel = "poor" | "developing" | "exceptional";

export interface QAPillarResult {
  /** Human-readable pillar name, e.g. "Structured Marketplace Differentiation" */
  name: string;
  /** Integer score 1-10 */
  score: number;
  /** Level derived from score: 1-4 poor, 5-7 developing, 8-10 exceptional */
  level: PillarLevel;
  /** Emoji for the level — 🔴, 🟡, 🟢 */
  emoji: string;
  /** Short one-line impact from the scorecard table */
  impact?: string;
  /** Exact client quote that created the opportunity (from pillar body) */
  client_signal?: string;
  /** What the rep actually said (from pillar body) */
  rep_response?: string;
  /** Analyst's diagnosis of what went right/wrong */
  diagnosis?: string;
  /** Exact replacement script the rep should have used */
  prescribed_fix?: string;
}

export interface QAAnalysisResultV2 {
  /** Version tag for forward-compat detection in UI components */
  version: "v2-5-pillars-gpt4o";
  model: "gpt-4o";
  /** 5 pillars of closer performance */
  pillars: QAPillarResult[];
  /** Sum of all pillar scores (0-50) */
  total_score: number;
  /** Mean of all pillar scores (0-10) */
  avg_score: number;
  /** Derived from avg_score: <5 poor, 5-7 developing, >7 exceptional */
  overall: PillarLevel;
  /** The single most important moment in the call (narrative block) */
  critical_moment?: string;
  /** Pattern flags detected, e.g. "Lead abundance mindset" */
  pattern_flags: string[];
  /** Max 3 concrete action items for coaching */
  action_items: string[];
  /** Full markdown output from GPT-4o (for debugging + report rendering) */
  raw_analysis: string;
}
