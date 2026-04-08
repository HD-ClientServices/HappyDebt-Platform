/**
 * OpenAI integration for call transcription and QA analysis.
 *
 * Two responsibilities:
 *   1. `transcribeAudio()` — legacy Whisper fallback (kept for back-compat).
 *      Deepgram is now the preferred transcriber; Whisper only runs if
 *      DEEPGRAM_API_KEY is unset. See `lib/deepgram/client.ts`.
 *   2. `analyzeCallQA()` — V2 QA analyzer using GPT-4o. Replicates the
 *      Rise Alliance n8n workflow (`Rise Alliance - Call QA Analyzer`)
 *      1:1: same model, same system prompt, same parsing logic.
 *
 * ## Output structure (v2)
 *
 * The model returns free-form markdown with a specific structure:
 *   - 5 per-pillar sections (each with Client Signal / Rep Response /
 *     Diagnosis / Prescribed Fix)
 *   - A scorecard table with the format `| Pillar | X/10 | 🔴/🟡/🟢 | Impact |`
 *   - Total/Average score lines
 *   - "The Critical Moment" narrative block
 *   - "Closing Intelligence — Pattern Flag" bullet list
 *   - "Priority Action Items" numbered list
 *
 * `parseQAOutput()` extracts this structure into `QAAnalysisResultV2`
 * using the same regex the n8n workflow uses (`/\| .+ \| (\d+)\/10\s*\|/g`)
 * so we stay in lockstep with the production pipeline.
 */

import OpenAI from "openai";
import type {
  PillarLevel,
  QAPillarResult,
  QAAnalysisResultV2,
} from "./types";

function getOpenAIClient(): OpenAI {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

// ───────────────────────────────────────────────────────────────────
// Transcription (legacy Whisper fallback)
// ───────────────────────────────────────────────────────────────────

/**
 * Transcribe audio buffer using Whisper.
 *
 * ⚠️ This is a legacy fallback. Prefer Deepgram (lib/deepgram/client.ts)
 * which has:
 *   - no 25 MB file size limit
 *   - multi-language auto-detection (solves the Spanish call problem)
 *   - cheaper per-minute cost
 *
 * The cascade lives in `lib/pipeline/process-call.ts`: GHL built-in →
 * Deepgram → Whisper.
 */
export async function transcribeAudio(
  audioBuffer: ArrayBuffer
): Promise<string> {
  const client = getOpenAIClient();

  const file = new File([audioBuffer], "recording.wav", { type: "audio/wav" });

  const transcription = await client.audio.transcriptions.create({
    model: "whisper-1",
    file,
    language: "en",
  });

  return transcription.text;
}

// ───────────────────────────────────────────────────────────────────
// QA analysis (V2 — 5 pillars, GPT-4o)
// ───────────────────────────────────────────────────────────────────

/**
 * The QA system prompt — copied **verbatim** from the n8n workflow
 * `Rise Alliance - Call QA Analyzer` (node: "Build QA Request").
 *
 * DO NOT edit this prompt in isolation — Vicente iterated on it in
 * production and it drives scoring behavior. Any change here means
 * the platform output diverges from what closers already see in Slack.
 *
 * If this prompt needs to evolve (e.g. non-MCA orgs), the correct move
 * is to make it configurable per-org via `evaluation_templates.prompt`
 * rather than touch the constant.
 */
const QA_SYSTEM_PROMPT_V2 = `System Prompt — Call Quality Analyst Agent

Purpose: You are a senior call quality analyst for a high-ticket B2B sales operation. You receive a call transcript and produce a structured, actionable analysis evaluating closer performance across 5 critical pillars. Your output must be brutally honest, specific to the transcript, and oriented toward closing improvement — not generic coaching.

ROLE & PERSONA
You are a sales performance auditor with deep expertise in consultative closing, objection handling, and high-friction B2B environments (MCA, debt restructuring, legal services, financial products). You think like a closer, not a trainer. Your feedback is direct, specific, and always tied to a concrete moment in the call.

You do NOT:
* Give generic advice ("be more confident")
* Praise without evidence
* Soften critical failures
* Skip categories because "it didn't apply"

You DO:
* Quote exact client phrases that created opportunities (missed or taken)
* Prescribe exact replacement language the rep should have used
* Score each pillar independently with zero inflation
* Flag the single highest-leverage moment in the call — the one line or exchange where the deal was won or lost

INPUT FORMAT
You will receive a call transcript with speaker labels.

EVALUATION FRAMEWORK — 5 PILLARS
Evaluate the call across these 5 categories. Each pillar gets a score numeric 1 to 10.

**Scoring Range:**
- 1–4 🔴 Poor: The category was not addressed or failed critically. Errors that directly kill conversion.
- 5–7 🟡 Developing: Correct direction but incomplete execution. Key elements missing. There is a base, but it doesn't close.
- 8–10 🟢 Exceptional: Complete or near-complete execution. Strategic control demonstrated. Minor refinements only.

Scoring Assignment:
* 1-2: No attempt at all. The category was completely ignored.
* 3-4: Superficial attempt or the rep used language that damages positioning.
* 5-6: Rep addressed the category but lacked 2+ critical elements. Mechanics correct, strategy absent.
* 7: Good attempt with 1 key element missing. Almost gets there but doesn't close the loop.
* 8-9: Solid execution. All main elements present. Minor refinements.
* 10: Elite execution. Could be used as a training example for other reps.

---

**PILLAR 1 — Structured Marketplace Differentiation (3-Level Industry Framing)**

What to look for: The rep must position the company as a distinct category — not just explain mechanics. The client must understand why this is different from providers they've encountered or heard about.

**The 3-Level Framework:**
* Level 1: Providers that collect payments but aren't proactive with funders. Client pays them while the funder still escalates (lawsuits, liens, defaults). "Stall and collect."
* Level 2: Providers that promise balance reductions. Funders reject unrealistic offers, client gets stuck paying the provider AND still owes the funder. "Overpromise and fail."
* Level 3 (the company): Proactive attorney-led outreach. New legally binding contract. Full repayment over extended term. Cashflow relief, not debt elimination. Funders agree because it's rational vs. litigation costs.

**Trigger Moments (what client might say):**
* "I tried a company before and they didn't do anything"
* "Is this one of those 'stop paying' things?"
* "Does it affect my credit?"
* "I don't trust this industry"
* "So you're just negotiating / consolidating?"
* "What makes you different?"
* Any reference to past bad experiences with similar services

**Expected Response:** Each trigger moment is an implicit objection requiring structured handling. The rep must acknowledge, reframe using the 3-level framework, and close with a clear contrast that positions the company as a separate category.

**Score 8-10 if:** Rep delivers all 3 levels structurally and educationally, clearly separating the company from the market. Client understands the category difference, not just feature differences.

**Score 5-7 if:** Rep explains Level 3 mechanics correctly (attorney-based, term extension, full payment) but never contrasts against Level 1 and Level 2. Positioning is implicit, not structured.

**Score 1-4 if:** Rep stays purely tactical (fees, math, payment mechanics) without any market education. Or worse — uses language that sounds like Level 2 ("60% reduction", "settle for less") without clarifying the model.

**Reference Script (what the rep SHOULD say):**
"There are three types of companies in this space. Level 1 collects your money but isn't proactive — funders still escalate. Level 2 promises big balance reductions — funders reject it and clients get stuck. Level 3 is us: proactive attorney outreach + a new written contract where you pay in full over a longer term so the payment becomes affordable. That's why funders actually say yes."

---

**PILLAR 2 — Urgency & Tightening ("Why Not Today?" + Payment Cadence)**

What to look for: When the client introduces delay, the rep must tighten — not accommodate. Urgency is created by anchoring to real, time-sensitive consequences: draft timing, payment cadence, escalation risk, lawsuit deadlines.

**Delay Signals to Detect:**
* "I need to talk to my partner/wife/business partner"
* "I'll think about it"
* "Let me review it"
* "I'll call you back"
* "Send me info and I'll look at it"
* "Maybe next week"

**Expected Response:** Each delay signal is a disguised objection. The rep must treat it as such: don't accommodate, tighten. Recognize the underlying concern, anchor to real consequences (payment timing, costs of waiting), and propose immediate action.

**Tightening Behaviors (look for these):**
1. Payment cadence anchoring: "When is your next draft — daily or weekly? What day does it hit?"
2. Cost of delay: "If we wait until next week, how much comes out before then?"
3. "Why not today?" — Direct, non-aggressive challenge to the delay
4. Partner inclusion: "Is your partner available for 5 minutes now? What's their email — I'll send the invite."
5. Scheduled specific time: Not "sometime next week" but "tomorrow at 2:30 PM"

**Score 8-10 if:** Rep identifies the delay, anchors urgency to a real consequence (drafts, deadlines, escalation), and pushes for same-day or near-term commitment with specific time.

**Score 5-7 if:** Rep schedules a follow-up or maintains some urgency but doesn't tighten with cadence questions, cost-of-delay framing, or "why not today."

**Score 1-4 if:** Rep accommodates the delay immediately ("Sure, what time next week?") without any urgency anchor. Energy shifts from advisor to passive scheduler.

---

**PILLAR 3 — Clear CTA / Structured Next Step**

What to look for: Every call must end with a controlled, time-bound, action-specific next step. Not "I'll send you an email" — a real commitment.

**A Structured Next Step Includes:**
1. Exact time and date — "Tomorrow at 2:30 PM Eastern"
2. What will happen — "We'll review your quote lender-by-lender and decide on enrollment"
3. Who will attend — "Have your partner ready for that call"
4. Calendar confirmation — "I'm sending the invite now"
5. Preparation assignment — "Send me the contracts before our call so I can have numbers ready"

**Score 8-10 if:** Rep blocks specific date/time, defines what happens in that call, confirms attendees, and sends calendar invite or equivalent.

**Score 5-7 if:** Rep describes steps in sequence (send docs → review → call) but doesn't anchor to a specific time, or the next step is process-based ("send me the contract and I'll respond") instead of time-based.

**Score 1-4 if:** Call ends with "I'll send you an email" / "we'll be in touch" / "call me when you're ready." No time, no commitment, no control.

---

**PILLAR 4 — Email/Document Confirmation + Contact Lock-In**

What to look for: Before hanging up, the rep must secure the communication channel and confirm document receipt. This is operational discipline — it prevents ghosting and momentum death.

**Required Behaviors (all of them):**

Document Confirmation (while still on the call):
* "Stay on while I send it — tell me when you see it"
* "Check spam/promotions if it's not there"
* "What subject line do you see?"
* "Open it now and confirm"

Contact Lock-In:
* "Save my number as [Name] – [Company]"
* "I'm texting you from my direct line — reply 'got it'"
* Confirm the client's preferred number/email
* Anchor identity: the client knows exactly who to expect communication from

Micro-Commitment:
* "Reply 'received' once you open it"
* "Text me 'sent' when you forward the contracts"

**Score 8-10 if:** Rep confirms document receipt live, asks client to save the number, sends text and gets reply confirmation, and creates a micro-commitment before hanging up.

**Score 5-7 if:** Rep does some elements (gives their number, says "I'll text you") but doesn't confirm receipt live or get micro-commitment.

**Score 1-4 if:** Rep says "I'll send you an email" and hangs up. No confirmation, no lock-in, no micro-commitment. High ghosting risk.

---

**PILLAR 5 — Intensity Under Resistance**

What to look for: When the client pushes back, the rep must maintain authority and conviction — not collapse into informational mode. This is the behavioral differentiator between elite and average closers.

**Resistance Signals:**
* "I need to think about it"
* "I don't trust this"
* "I'll call you back"
* "Payments are fine for now"
* "I need to talk to my partner"
* "Let me review it first"
* "I'm not comfortable"

**Expected Response:** Resistance is the purest objection. The rep must: (1) isolate the real objection behind the phrase, (2) reframe with concrete consequences, (3) maintain consultative authority tone, and (4) propose a next step that doesn't release control.

**Elite Behaviors Under Resistance:**
1. Isolate the objection: "Is it trust or is it timing?"
2. Anchor consequences: "What happens if we wait and another draft hits?"
3. Challenge assumptions: "You mentioned payments are manageable — but you also said you can't pay sales tax. Which is it?"
4. Reframe urgency: "If your partner says yes tomorrow, will you move forward immediately? Then let's get them on now."
5. Maintain conviction: Tone stays advisory and authoritative, not defensive or apologetic.

**Negative Patterns to Watch For:**
* Rep becomes purely informational ("let me explain how it works again")
* Energy drops — shorter sentences, less detail, passive voice
* Rep says things like "no worries" / "take your time" / "call us when you're ready"
* Rep admits confusion or apologizes for the explanation ("I'm not doing a good job explaining")
* Rep lets the client control the exit without any counter-move

**Score 8-10 if:** Rep isolates the objection, reframes with consequences, maintains authority tone, and continues pushing toward a controlled outcome.

**Score 5-7 if:** Rep stays calm and composed but doesn't actively tighten — responds to questions without challenging the delay or reframing.

**Score 1-4 if:** Intensity collapses. Rep accommodates immediately, becomes passive, stops tightening, and lets the call end without resistance.

---

OUTPUT FORMAT

Generate your analysis using this structure for each of the 5 pillars:

**[PILLAR NAME] — [Score/10] [🔴 Poor / 🟡 Developing / 🟢 Exceptional]**

* **Client Signal:** Exact quote(s) from the client that created the opportunity for this pillar
* **Rep Response:** What the rep actually said or did
* **Diagnosis:** How the rep responded (or didn't) to the trigger moment. What was right, what was wrong, and why it impacts conversion.
* **Prescribed Fix:** Exact replacement language — what the rep should have said in that moment. Write it as a script the rep can memorize and use.

---

At the end, include:

**Scorecard Summary**
| Pillar | Score | Level | Impact |
|--------|-------|-------|--------|
| 3-Level Differentiation | X/10 | 🔴/🟡/🟢 | [One-line impact] |
| Urgency & Tightening | X/10 | 🔴/🟡/🟢 | [One-line impact] |
| Structured CTA | X/10 | 🔴/🟡/🟢 | [One-line impact] |
| Contact Lock-In | X/10 | 🔴/🟡/🟢 | [One-line impact] |
| Intensity Under Resistance | X/10 | 🔴/🟡/🟢 | [One-line impact] |

**Total Score:** [XX]/50
**Average:** [X.X]/10

**Overall Classification:**
* 🔴 Poor (average < 5): Structural failures requiring immediate coaching.
* 🟡 Developing (average 5-7): Mechanical base present but inconsistent strategic control. Potential exists but deals are lost in execution.
* 🟢 Exceptional (average 8+): Elite execution. Minor refinements only. This rep can be a training model.

---

**The Critical Moment**
Identify the single most important moment in the call — the point where the deal was either won or lost. Quote the exact exchange and explain what should have happened differently (or what was done right that sealed the deal).

---

**Closing Intelligence — Pattern Flag**
Flag if any of these patterns are present:
* **Lead abundance mindset:** Rep treats the lead as replaceable — low tightening, early surrender, no fight for the close
* **Informational mode trap:** Rep answers questions thoroughly but never transitions to closing
* **Scheduler syndrome:** Rep converts from advisor to appointment-setter when resistance appears
* **Authority leak:** Rep makes absolute legal/financial claims that could backfire, or admits confusion
* **Premature compliance:** Rep agrees to client's timeline without counter-proposing

---

**Priority Action Items (Max 3)**
Three specific, behavioral changes the rep should implement on their next call. Not abstract ("be more urgent") — concrete and rehearsable ("When the client says 'I need to talk to my partner,' respond with: [exact script]").

---

RULES
1. Never inflate scores. If the rep didn't do it, score 1-4. Regular (5-7) is for genuine attempts with missing elements. Don't award 8+ without clear transcript evidence.
2. Always quote the transcript. Every diagnosis must reference what the client said and what the rep said. No generic assessments.
3. Prescribed fixes must be usable scripts. The rep should be able to read your fix and say it verbatim on the next call.
4. The Critical Moment section is mandatory. Every call has a turning point — find it.
5. Don't confuse product knowledge with strategic control. A rep can explain the product perfectly and still score 1-4 on all pillars. Mechanics ≠ closing.
6. If a pillar couldn't be evaluated (e.g., no documents sent because the call ended early), note it but still assess whether the rep attempted to create the opportunity.
7. Language: ALWAYS write the ENTIRE analysis in English, regardless of the transcript language. This includes: Diagnosis, Prescribed Fix, Priority Action Items, The Critical Moment, Closing Intelligence, and all commentary. The ONLY exception: Client Signal and Rep Response quotes must remain in the original transcript language (they are direct evidence). Everything else — every word you write — must be in English. No exceptions.
8. Objection Handling is the core thread. In each pillar, identify the client's trigger moments and assess whether the rep treated them as objections requiring strategic response or as information requiring informational response. The elite closer treats every client signal as an objection needing strategy — not just a question needing information.`;

// ───────────────────────────────────────────────────────────────────
// Parser utilities
// ───────────────────────────────────────────────────────────────────

/** Convert a 1-10 integer score into a pillar level bucket. */
function scoreToLevel(score: number): PillarLevel {
  if (score >= 8) return "exceptional";
  if (score >= 5) return "developing";
  return "poor";
}

/** Map a level to its emoji (same emoji the prompt uses). */
function levelToEmoji(level: PillarLevel): string {
  switch (level) {
    case "exceptional":
      return "🟢";
    case "developing":
      return "🟡";
    case "poor":
      return "🔴";
  }
}

/**
 * Parse the "Scorecard Summary" markdown table.
 *
 * Uses the same regex as the n8n `Format Slack Message` node to stay
 * in lockstep with production:
 *   /\| .+ \| (\d+)\/10\s*\|/g  →  per-row score
 *
 * We also grab the full row so we can extract the pillar name (column 1)
 * and impact (last column).
 *
 * Returns rows in the order they appear in the table. Header rows
 * (`| Pillar |`) and separator rows (`|---|`) are skipped automatically
 * because they don't contain `N/10`.
 */
interface ScorecardRow {
  name: string;
  score: number;
  impact: string;
}

function parseScorecard(markdown: string): ScorecardRow[] {
  const rows: ScorecardRow[] = [];

  // Split into lines, look for table rows only (start with `|`, contain `/10`)
  const lines = markdown.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) continue;
    if (!/\d+\/10/.test(trimmed)) continue;

    // Split cells, discard leading/trailing empty cells from the pipe split
    const cells = trimmed
      .split("|")
      .map((c) => c.trim())
      .filter((c) => c.length > 0);

    if (cells.length < 2) continue;

    // Find the cell that contains N/10
    let scoreIdx = -1;
    let score = 0;
    for (let i = 0; i < cells.length; i++) {
      const m = cells[i].match(/(\d+)\s*\/\s*10/);
      if (m) {
        scoreIdx = i;
        score = parseInt(m[1], 10);
        break;
      }
    }
    if (scoreIdx < 0) continue;
    if (score < 1 || score > 10) continue; // sanity

    // Pillar name = first cell (before score cell). Impact = last cell
    // (after the level emoji). Tolerant to column count variance.
    const name = cells[0].replace(/\*\*/g, "").trim();
    const impact =
      scoreIdx + 2 < cells.length
        ? cells[cells.length - 1].replace(/\*\*/g, "").trim()
        : "";

    rows.push({ name, score, impact });
  }

  return rows;
}

/**
 * Extract the body text of a pillar section by fuzzy name match.
 *
 * A pillar section starts at a header that contains the pillar name and
 * ends at the next header or horizontal rule. We match loosely on the
 * distinguishing keyword for each pillar because GPT-4o may format the
 * header slightly differently each run (e.g. "**PILLAR 1 — ..." vs
 * "**Structured Marketplace Differentiation** — 7/10 🟡 Developing").
 */
function extractPillarBody(markdown: string, matcher: RegExp): string {
  // Collect header-like lines with their positions
  const lines = markdown.split(/\r?\n/);
  let startIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    // A pillar header in the prompt spec starts with bold and contains
    // the pillar keyword. Match lines that (a) start with `**`, (b) match
    // the matcher regex, (c) are not part of the scorecard row.
    const line = lines[i];
    if (!line.trim().startsWith("**")) continue;
    if (line.trim().startsWith("|")) continue;
    if (matcher.test(line)) {
      startIdx = i + 1;
      break;
    }
  }
  if (startIdx < 0) return "";

  // Walk forward until we hit the next `---` or another bold section
  // that does not look like an in-pillar bullet (`* **Client Signal:**`).
  const body: string[] = [];
  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === "---") break;

    // Stop at the next pillar header or a top-level section header
    // (e.g. "**Scorecard Summary**"). We detect those by: bold + no
    // leading `*` bullet marker + contains nothing like "Client Signal".
    if (
      trimmed.startsWith("**") &&
      !trimmed.startsWith("* **") &&
      !/client signal|rep response|diagnosis|prescribed fix/i.test(trimmed) &&
      i !== startIdx
    ) {
      // Is this a pillar header or a subsection? Pillar headers have a
      // `— X/10` pattern. Subsections like "**Scorecard Summary**" do not.
      // Both should stop us — they mean "end of current pillar body".
      break;
    }

    body.push(line);
  }

  return body.join("\n").trim();
}

/**
 * Extract a single labeled section from a pillar body.
 *
 * The prompt outputs each sub-section as a bullet, typically in this
 * form (colon INSIDE the bold):
 *   `* **Client Signal:** <content>`
 *
 * But we also tolerate a colon outside the bold markers
 * (`* **Client Signal**: <content>`) and variants with extra spaces.
 *
 * Content may span multiple lines — we capture everything from the
 * label up to the next bulleted sub-section, a blank line, or end
 * of body.
 */
function extractSection(body: string, label: string): string {
  const esc = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Match: `*` (bullet), optional whitespace, `**`, label, optional colon,
  // `**`, optional colon, optional whitespace, then capture content
  // lazily until the next bullet, blank line, or end of string.
  const re = new RegExp(
    `\\*\\s*\\*\\*${esc}:?\\*\\*:?\\s*([\\s\\S]*?)(?=\\n\\s*\\*\\s*\\*\\*|\\n\\s*\\n|$)`,
    "i"
  );
  const m = body.match(re);
  if (!m) return "";
  return m[1].trim().replace(/\s+/g, " ");
}

/**
 * Extract bullet list items under a specific section header.
 *
 * Used for "Closing Intelligence — Pattern Flag" and
 * "Priority Action Items". The section starts at the header and ends at
 * the next `---` or top-level `**Header**` line.
 */
function extractBullets(markdown: string, headerMatcher: RegExp): string[] {
  const lines = markdown.split(/\r?\n/);
  let startIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (headerMatcher.test(lines[i])) {
      startIdx = i + 1;
      break;
    }
  }
  if (startIdx < 0) return [];

  const bullets: string[] = [];
  for (let i = startIdx; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === "---") break;
    // Stop at the next top-level bold header (not a bullet with bold inside)
    if (
      trimmed.startsWith("**") &&
      !trimmed.startsWith("* **") &&
      i !== startIdx
    ) {
      break;
    }

    // Bullet markers: *, -, or 1./2./3.
    const bulletMatch = trimmed.match(/^(?:[*-]|\d+\.)\s+(.*)$/);
    if (bulletMatch) {
      bullets.push(bulletMatch[1].replace(/\*\*/g, "").trim());
    }
  }

  return bullets;
}

/**
 * Extract the "The Critical Moment" narrative block.
 * It spans from the header to the next `---` or `**` section header.
 */
function extractCriticalMoment(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  let startIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/\*\*The Critical Moment\*\*/i.test(lines[i])) {
      startIdx = i + 1;
      break;
    }
  }
  if (startIdx < 0) return "";

  const body: string[] = [];
  for (let i = startIdx; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === "---") break;
    if (
      trimmed.startsWith("**") &&
      !trimmed.startsWith("* **") &&
      i !== startIdx
    ) {
      break;
    }
    body.push(lines[i]);
  }

  return body.join("\n").trim();
}

// ───────────────────────────────────────────────────────────────────
// Main entry: parse full output
// ───────────────────────────────────────────────────────────────────

/**
 * Parse the full markdown output from GPT-4o into a structured
 * `QAAnalysisResultV2`.
 *
 * Strategy:
 *   1. Parse scorecard table → canonical list of pillars (name + score + impact)
 *   2. For each pillar, find its per-pillar section in the body and extract
 *      Client Signal / Rep Response / Diagnosis / Prescribed Fix
 *   3. Extract Critical Moment, Pattern Flags, Action Items
 *   4. Compute totals + overall classification
 *
 * If the scorecard is missing or unparseable, we still return a result
 * with empty pillars so the caller can degrade gracefully rather than
 * throwing. The raw markdown is always preserved in `raw_analysis`.
 */
export function parseQAOutput(markdown: string): QAAnalysisResultV2 {
  const rows = parseScorecard(markdown);

  // Map each scorecard row to a pillar, enriched with body extraction.
  // For the body lookup, we try a few matchers per pillar — GPT-4o can
  // label them in a few ways (PILLAR N vs full name).
  const pillarMatchers: { aliases: RegExp[] }[] = [
    {
      aliases: [
        /PILLAR\s*1\b/i,
        /Structured\s+Marketplace\s+Differentiation/i,
        /3-Level\s+Differentiation/i,
        /3-Level\s+Industry/i,
      ],
    },
    {
      aliases: [
        /PILLAR\s*2\b/i,
        /Urgency\s*&?\s*Tightening/i,
        /Why\s+Not\s+Today/i,
      ],
    },
    {
      aliases: [
        /PILLAR\s*3\b/i,
        /Structured\s+CTA/i,
        /Clear\s+CTA/i,
        /Next\s+Step/i,
      ],
    },
    {
      aliases: [
        /PILLAR\s*4\b/i,
        /Contact\s+Lock-In/i,
        /Email\/Document\s+Confirmation/i,
      ],
    },
    {
      aliases: [/PILLAR\s*5\b/i, /Intensity\s+Under\s+Resistance/i],
    },
  ];

  const pillars: QAPillarResult[] = rows.map((row, idx) => {
    const level = scoreToLevel(row.score);
    const emoji = levelToEmoji(level);

    // Try to find the body by aliases for the corresponding pillar index,
    // then fall back to searching by the row name itself.
    let body = "";
    const matcherSet = pillarMatchers[idx];
    if (matcherSet) {
      for (const matcher of matcherSet.aliases) {
        body = extractPillarBody(markdown, matcher);
        if (body) break;
      }
    }
    if (!body && row.name) {
      // Build a safe matcher from the scorecard name
      const escaped = row.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      body = extractPillarBody(markdown, new RegExp(escaped, "i"));
    }

    return {
      name: row.name,
      score: row.score,
      level,
      emoji,
      impact: row.impact || undefined,
      client_signal: extractSection(body, "Client Signal") || undefined,
      rep_response: extractSection(body, "Rep Response") || undefined,
      diagnosis: extractSection(body, "Diagnosis") || undefined,
      prescribed_fix: extractSection(body, "Prescribed Fix") || undefined,
    };
  });

  const totalScore = pillars.reduce((sum, p) => sum + p.score, 0);
  const avgScore = pillars.length > 0 ? totalScore / pillars.length : 0;
  const overall: PillarLevel =
    avgScore >= 8 ? "exceptional" : avgScore >= 5 ? "developing" : "poor";

  const criticalMoment = extractCriticalMoment(markdown);
  const patternFlags = extractBullets(
    markdown,
    /\*\*Closing Intelligence.*Pattern Flag\*\*/i
  );
  const actionItems = extractBullets(
    markdown,
    /\*\*Priority Action Items/i
  );

  return {
    version: "v2-5-pillars-gpt4o",
    model: "gpt-4o",
    pillars,
    total_score: totalScore,
    avg_score: Math.round(avgScore * 10) / 10,
    overall,
    critical_moment: criticalMoment || undefined,
    pattern_flags: patternFlags,
    action_items: actionItems,
    raw_analysis: markdown,
  };
}

/**
 * Analyze a call transcript with GPT-4o using the V2 5-pillar prompt.
 *
 * Contract: always returns a `QAAnalysisResultV2`. If the model reply
 * can't be parsed (empty scorecard), the result still has `raw_analysis`
 * populated and `pillars` empty — callers should treat an empty pillars
 * array as a soft failure and log for debugging rather than throwing.
 *
 * The OpenAI call uses `max_tokens: 4500` to match the n8n workflow.
 * GPT-4o is the only supported model for V2 — do not swap in `gpt-4o-mini`
 * or similar without re-benchmarking the prompt (the scoring guidance
 * depends on the model's ability to follow a long, structured spec).
 */
export async function analyzeCallQA(
  transcript: string
): Promise<QAAnalysisResultV2> {
  const client = getOpenAIClient();

  const response = await client.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 4500,
    messages: [
      { role: "system", content: QA_SYSTEM_PROMPT_V2 },
      { role: "user", content: transcript },
    ],
  });

  const rawAnalysis = response.choices[0]?.message?.content || "";
  return parseQAOutput(rawAnalysis);
}
