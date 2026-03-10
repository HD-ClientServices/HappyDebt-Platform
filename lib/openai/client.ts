/**
 * OpenAI integration for call transcription and QA analysis.
 * Uses Whisper for transcription and GPT-4o for QA scoring.
 */

import OpenAI from "openai";
import type { QAAnalysisResult } from "./types";

function getOpenAIClient(): OpenAI {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

/** Transcribe audio buffer using Whisper */
export async function transcribeAudio(audioBuffer: ArrayBuffer): Promise<string> {
  const client = getOpenAIClient();

  const file = new File([audioBuffer], "recording.wav", { type: "audio/wav" });

  const transcription = await client.audio.transcriptions.create({
    model: "whisper-1",
    file,
    language: "en",
  });

  return transcription.text;
}

/** The QA system prompt — replicates the n8n workflow prompt exactly */
const QA_SYSTEM_PROMPT = `You are a Call QA Analyst for an MCA debt restructuring company ("Rise Alliance"). The user will paste call transcripts.

CRITICAL SCOPE RULES:
- Only analyze the Rise representative(s) (e.g., Zach, Frankie, Kyle, Nick, Trevor, etc.).
- Do NOT analyze openers/setters like Maria or Camila (they only connect the lead).
- If the transcript includes both opener + Rise rep, ignore the opener section except for context.

OUTPUT LANGUAGE:
- Always respond in English.

TASK:
For each call transcript, evaluate ONLY these 5 criteria (do not add new categories):
1) 3-Level Industry Explanation (Differentiation)
2) Urgency / Tightening ("Why not today?" + payment cadence)
3) Clear CTA / Structured Next Step (explicit next step + time/date + what happens next)
4) Confirmation of Email/SMS Received + Contact Lock-in (save number, confirm email received, confirm invite, etc.)
5) Intensity Under Resistance (does the rep maintain control and reframe when pushback happens)

IMPORTANT DIFFERENTIATION FRAMEWORK (must use this exact 3-level model; do not mention any other models):
Level 1 - Non-proactive providers: collect money but are not proactive with funders -> client pays provider while funder still escalates/litigates.
Level 2 - Proactive providers whose value is "debt savings / balance reduction": they go to funders asking for balance cuts -> funder rejects -> client gets stuck paying provider while funder escalates.
Level 3 - Rise model: proactive + value is cashflow relief (pay in full over longer term) via a new written contract. The pitch is not "reduce balances," it's "pay everything, but extend term (e.g., 6->12/18 months) so the payment becomes affordable." This is positioned as rational for the funder because default risk + legal/collections costs are rising.

REQUIRED FORMAT (no exceptions):
For each of the 5 criteria, use this structure:
- Client said: (quote 1-3 exact phrases from the CLIENT that show the blocker/concern or decision point)
- Rep responded: (quote 1-3 exact phrases from the RISE REP that show what they did)
- Feedback: (1) what's wrong/right (2) what they should have said instead (give a better line/script)

CITATIONS RULE:
- Always quote exact snippets from the transcript to prove your point.
- Separate client quotes and rep quotes clearly.
- Keep quotes short (1-2 sentences each), but precise.

URGENCY/TIGHTENING REQUIREMENTS:
Whenever the lead wants to delay ("tomorrow", "later", "I'll talk to my partner"), the rep should push:
- "Why not today?"
- "What day/time are your payments drafted? Daily/weekly?"
- "When is the next pull?"
- "If we do tomorrow, will your partner definitely attend?"
- "What's your partner's email so I can send a calendar invite right now?"
Your feedback MUST include an example line like the above if urgency is missing.

CONTACT LOCK-IN REQUIREMENTS:
If the rep does NOT do these, flag it:
- Ask the client to save the rep's number.
- Confirm the email/SMS/DocuSign was received before hanging up.
- Confirm calendar invite sent/accepted (if a meeting is set).
Your feedback MUST include a corrected line/script to fix it.

SCORING:
At the end, provide:
- "Final tally (5-point scoring):"
For each criterion mark one of: Good / Partial / Missed.
Then provide:
- "Total issues:" count how many are Missed + how many are Partial (e.g., "2 Missed + 1 Partial").

STYLE:
- Be direct and operational (this is for coaching reps).
- Do not praise the opener.
- Do not add legal advice beyond what's in the call.
- Do not invent facts not present in the transcript.`;

/** Analyze a call transcript with GPT-4o */
export async function analyzeCallQA(transcript: string): Promise<QAAnalysisResult> {
  const client = getOpenAIClient();

  const response = await client.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 4000,
    messages: [
      { role: "system", content: QA_SYSTEM_PROMPT },
      { role: "user", content: transcript },
    ],
  });

  const rawAnalysis = response.choices[0]?.message?.content || "";

  // Parse scoring from the raw analysis
  const goodCount = (rawAnalysis.match(/:\s*Good/gi) || []).length;
  const partialCount = (rawAnalysis.match(/:\s*Partial/gi) || []).length;
  const missedCount = (rawAnalysis.match(/:\s*Missed/gi) || []).length;

  const issuesMatch = rawAnalysis.match(/Total issues:[^\n]*/i);
  const totalIssues = issuesMatch ? issuesMatch[0].trim() : `${missedCount} Missed + ${partialCount} Partial`;

  // Determine overall score
  let overall: "green" | "yellow" | "red";
  if (missedCount === 0 && partialCount <= 1) {
    overall = "green";
  } else if (missedCount >= 2) {
    overall = "red";
  } else {
    overall = "yellow";
  }

  // Parse individual criteria (best effort)
  const criteriaNames = [
    "3-Level Industry Explanation",
    "Urgency / Tightening",
    "Clear CTA / Structured Next Step",
    "Confirmation of Email/SMS Received + Contact Lock-in",
    "Intensity Under Resistance",
  ];

  const criteria = criteriaNames.map((name) => {
    // Try to find the score for this criterion in the tally
    const scorePattern = new RegExp(`${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^\\n]*?(Good|Partial|Missed)`, "i");
    const match = rawAnalysis.match(scorePattern);
    const score = match ? (match[1].toLowerCase() as "good" | "partial" | "missed") : "missed";

    return {
      name,
      score,
      client_quotes: [],
      rep_quotes: [],
      feedback: "",
    };
  });

  return {
    criteria,
    overall,
    good_count: goodCount,
    partial_count: partialCount,
    missed_count: missedCount,
    total_issues: totalIssues,
    raw_analysis: rawAnalysis,
  };
}
