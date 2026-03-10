/** OpenAI QA Analysis type definitions */

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
