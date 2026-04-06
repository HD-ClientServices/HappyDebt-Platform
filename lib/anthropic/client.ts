/**
 * Anthropic Claude integration for call QA analysis.
 * Supports dynamic evaluation templates per organization.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { QAAnalysisResult } from "@/lib/openai/types";
import type { EvaluationCriteria } from "@/types/database";

function getAnthropicClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("Missing ANTHROPIC_API_KEY environment variable");
  }
  return new Anthropic({ apiKey });
}

/** Default 5 criteria (Rise Alliance) — used when no template is provided */
const DEFAULT_CRITERIA: EvaluationCriteria[] = [
  {
    name: "3-Level Industry Explanation",
    description:
      "Differentiation using the 3-level model: Level 1 (non-proactive providers), Level 2 (proactive but balance-reduction focused), Level 3 (Rise model: cashflow relief via extended term with new written contract).",
    weight: 0.2,
    max_score: 100,
  },
  {
    name: "Urgency / Tightening",
    description:
      'Push for immediate action: "Why not today?", payment cadence questions, next pull date, partner scheduling with concrete time.',
    weight: 0.2,
    max_score: 100,
  },
  {
    name: "Clear CTA / Structured Next Step",
    description:
      "Explicit next step with time/date set, clear explanation of what happens next in the process.",
    weight: 0.2,
    max_score: 100,
  },
  {
    name: "Confirmation of Email/SMS Received + Contact Lock-in",
    description:
      "Ask client to save rep's number, confirm email/SMS/DocuSign received, confirm calendar invite sent/accepted.",
    weight: 0.2,
    max_score: 100,
  },
  {
    name: "Intensity Under Resistance",
    description:
      "Maintain control and reframe when pushback happens. Stay assertive without being aggressive.",
    weight: 0.2,
    max_score: 100,
  },
];

/** Build the QA system prompt dynamically from evaluation criteria */
function buildQAPrompt(criteria: EvaluationCriteria[]): string {
  const criteriaSection = criteria
    .map(
      (c, i) =>
        `${i + 1}) ${c.name}${c.description ? `\n   Description: ${c.description}` : ""}`
    )
    .join("\n");

  const jsonCriteria = criteria
    .map(
      (c) =>
        `    {"name": "${c.name}", "score": "good|partial|missed", "feedback": "..."}`
    )
    .join(",\n");

  return `You are a Call QA Analyst for a debt restructuring company. The user will paste call transcripts.

CRITICAL SCOPE RULES:
- Only analyze the company representative(s).
- Do NOT analyze openers/setters (they only connect the lead).
- If the transcript includes both opener + rep, ignore the opener section except for context.

OUTPUT LANGUAGE:
- Always respond in English.

TASK:
For each call transcript, evaluate ONLY these ${criteria.length} criteria (do not add new categories):
${criteriaSection}

REQUIRED FORMAT (no exceptions):
For each of the ${criteria.length} criteria, use this structure:
- Client said: (quote 1-3 exact phrases from the CLIENT that show the blocker/concern or decision point)
- Rep responded: (quote 1-3 exact phrases from the REP that show what they did)
- Feedback: (1) what's wrong/right (2) what they should have said instead (give a better line/script)

CITATIONS RULE:
- Always quote exact snippets from the transcript to prove your point.
- Separate client quotes and rep quotes clearly.
- Keep quotes short (1-2 sentences each), but precise.

SCORING:
At the end, provide a JSON block between <json> and </json> tags with this exact structure:
<json>
{
  "criteria": [
${jsonCriteria}
  ]
}
</json>

Also provide a plain text "Final tally (${criteria.length}-point scoring):" section after the JSON.
For each criterion mark one of: Good / Partial / Missed.
Then provide: "Total issues:" count how many are Missed + how many are Partial.

STYLE:
- Be direct and operational (this is for coaching reps).
- Do not praise the opener.
- Do not add legal advice beyond what's in the call.
- Do not invent facts not present in the transcript.`;
}

/** Analyze a call transcript with Claude, optionally using org-specific criteria */
export async function analyzeCallQA(
  transcript: string,
  criteria?: EvaluationCriteria[]
): Promise<QAAnalysisResult> {
  const client = getAnthropicClient();
  const activeCriteria = criteria && criteria.length > 0 ? criteria : DEFAULT_CRITERIA;
  const systemPrompt = buildQAPrompt(activeCriteria);

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: "user", content: transcript }],
  });

  const rawAnalysis =
    response.content
      .filter((block) => block.type === "text")
      .map((block) => {
        if (block.type === "text") return block.text;
        return "";
      })
      .join("\n") || "";

  // Try to parse structured JSON from <json> tags
  const jsonMatch = rawAnalysis.match(/<json>([\s\S]*?)<\/json>/);
  let parsedCriteria: Array<{ name: string; score: string; feedback: string }> =
    [];

  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      parsedCriteria = parsed.criteria || [];
    } catch {
      // Fall back to regex parsing
    }
  }

  // Count scores from parsed criteria or regex fallback
  const goodCount =
    parsedCriteria.filter((c) => c.score === "good").length ||
    (rawAnalysis.match(/:\s*Good/gi) || []).length;
  const partialCount =
    parsedCriteria.filter((c) => c.score === "partial").length ||
    (rawAnalysis.match(/:\s*Partial/gi) || []).length;
  const missedCount =
    parsedCriteria.filter((c) => c.score === "missed").length ||
    (rawAnalysis.match(/:\s*Missed/gi) || []).length;

  const issuesMatch = rawAnalysis.match(/Total issues:[^\n]*/i);
  const totalIssues =
    issuesMatch
      ? issuesMatch[0].trim()
      : `${missedCount} Missed + ${partialCount} Partial`;

  // Determine overall score
  let overall: "green" | "yellow" | "red";
  if (missedCount === 0 && partialCount <= 1) {
    overall = "green";
  } else if (missedCount >= 2) {
    overall = "red";
  } else {
    overall = "yellow";
  }

  // Build criteria results dynamically from the active criteria
  const criteriaResults = activeCriteria.map((criterion) => {
    // Try from parsed JSON first (fuzzy match on name prefix)
    const parsed = parsedCriteria.find((c) =>
      c.name.toLowerCase().includes(criterion.name.toLowerCase().slice(0, 15))
    );

    if (parsed) {
      return {
        name: criterion.name,
        score: parsed.score as "good" | "partial" | "missed",
        client_quotes: [] as string[],
        rep_quotes: [] as string[],
        feedback: parsed.feedback || "",
      };
    }

    // Fallback to regex
    const scorePattern = new RegExp(
      `${criterion.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^\\n]*?(Good|Partial|Missed)`,
      "i"
    );
    const match = rawAnalysis.match(scorePattern);
    const score = match
      ? (match[1].toLowerCase() as "good" | "partial" | "missed")
      : "missed";

    return {
      name: criterion.name,
      score,
      client_quotes: [],
      rep_quotes: [],
      feedback: "",
    };
  });

  return {
    criteria: criteriaResults,
    overall,
    good_count: goodCount,
    partial_count: partialCount,
    missed_count: missedCount,
    total_issues: totalIssues,
    raw_analysis: rawAnalysis,
  };
}

/**
 * Compute a weighted evaluation score from QA results and template criteria.
 * Returns a score 0-100.
 */
export function computeWeightedScore(
  criteriaResults: Array<{ score: string }>,
  templateCriteria?: EvaluationCriteria[]
): number {
  if (criteriaResults.length === 0) return 0;

  const weights = templateCriteria && templateCriteria.length === criteriaResults.length
    ? templateCriteria.map((c) => c.weight)
    : criteriaResults.map(() => 1 / criteriaResults.length);

  const totalWeight = weights.reduce((sum, w) => sum + w, 0);

  let weightedScore = 0;
  for (let i = 0; i < criteriaResults.length; i++) {
    const score = criteriaResults[i].score;
    const points = score === "good" ? 100 : score === "partial" ? 50 : 0;
    weightedScore += points * (weights[i] / totalWeight);
  }

  return Math.round(weightedScore);
}
