import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type {
  QAAnalysisResultV2,
  QAPillarResult,
  PillarLevel,
} from "@/lib/openai/types";

/**
 * GET /api/reports/qa/[callId]
 *
 * Returns a standalone HTML page rendering the call QA analysis.
 *
 * Supports two output formats:
 *   - V2 (`ai_analysis.version === "v2-5-pillars-gpt4o"`): 5-pillar
 *     scorecard, per-pillar Client Signal / Rep Response / Diagnosis /
 *     Prescribed Fix, Critical Moment, Pattern Flags, Action Items.
 *     This is the format emitted by the current pipeline (`analyzeCallQA`
 *     in lib/openai/client.ts).
 *   - Legacy V1: the older Claude-era good/partial/missed structure.
 *     Rendered for back-compat in case any old rows still exist.
 *
 * RLS handles org scoping automatically — a user can only fetch reports
 * that belong to their active org.
 */

// ── Legacy V1 analysis shape (kept for backward compatibility) ────

interface LegacyCriterion {
  name: string;
  score: string;
  feedback: string;
}

interface LegacyAIAnalysis {
  criteria: LegacyCriterion[];
  overall: number | string;
  good_count: number;
  partial_count: number;
  missed_count: number;
  raw_analysis?: string;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ callId: string }> }
) {
  try {
    const { callId } = await params;

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch call recording with joined closer and lead (RLS scoped)
    const { data: recording, error } = await supabase
      .from("call_recordings")
      .select("*, closers(name), leads(name, business_name)")
      .eq("id", callId)
      .single();

    if (error || !recording) {
      return new NextResponse("Not Found", { status: 404 });
    }

    const rawAnalysis = recording.ai_analysis as Record<string, unknown> | null;

    const closerName =
      (recording.closers as { name: string } | null)?.name ?? "Unknown Closer";
    const leadData = recording.leads as
      | { name: string; business_name?: string }
      | null;
    const leadName = leadData?.name ?? "Unknown Lead";
    const businessName = leadData?.business_name ?? "";
    const callDate = recording.call_date
      ? new Date(recording.call_date).toLocaleString("en-US", {
          dateStyle: "medium",
          timeStyle: "short",
        })
      : "N/A";
    const durationSec =
      (recording.duration_seconds as number | null | undefined) ?? 0;
    const duration = durationSec
      ? `${Math.floor(durationSec / 60)}m ${durationSec % 60}s`
      : "N/A";

    const isV2 = rawAnalysis?.version === "v2-5-pillars-gpt4o";

    const bodyHtml = isV2
      ? renderV2(rawAnalysis as unknown as QAAnalysisResultV2)
      : renderLegacy(rawAnalysis as unknown as LegacyAIAnalysis | null);

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>QA Report — ${escapeHtml(leadName)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #09090b;
      color: #f4f4f5;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      padding: 32px;
      line-height: 1.6;
      font-size: 14px;
    }
    .container { max-width: 960px; margin: 0 auto; }

    /* Header */
    .header {
      margin-bottom: 32px;
      padding-bottom: 24px;
      border-bottom: 1px solid #27272a;
    }
    .header h1 {
      font-size: 26px;
      font-weight: 700;
      margin-bottom: 6px;
      letter-spacing: -0.01em;
    }
    .business-subtitle {
      color: #71717a;
      font-size: 14px;
      margin-bottom: 14px;
    }
    .meta {
      display: flex;
      gap: 24px;
      flex-wrap: wrap;
      color: #a1a1aa;
      font-size: 13px;
    }
    .meta span { display: flex; align-items: center; gap: 6px; }
    .header-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 24px;
    }

    /* Big score badge */
    .big-score {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      width: 120px;
      height: 120px;
      border-radius: 16px;
      border: 2px solid;
      flex-shrink: 0;
    }
    .big-score .value {
      font-size: 38px;
      font-weight: 800;
      line-height: 1;
    }
    .big-score .unit {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      margin-top: 4px;
      opacity: 0.7;
    }
    .big-score .avg {
      font-size: 13px;
      margin-top: 6px;
      opacity: 0.85;
    }

    /* Section cards */
    .section {
      background: #18181b;
      border-radius: 10px;
      padding: 22px 24px;
      margin-bottom: 20px;
      border: 1px solid #27272a;
    }
    .section h2 {
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #a1a1aa;
      font-weight: 600;
      margin-bottom: 16px;
    }

    /* Scorecard table */
    table.scorecard {
      width: 100%;
      border-collapse: collapse;
    }
    table.scorecard th {
      text-align: left;
      padding: 10px 12px;
      color: #71717a;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      font-weight: 600;
      border-bottom: 1px solid #27272a;
    }
    table.scorecard td {
      padding: 14px 12px;
      border-bottom: 1px solid #27272a;
      vertical-align: top;
    }
    table.scorecard tr:last-child td { border-bottom: none; }
    table.scorecard .pillar-name {
      font-weight: 600;
      color: #f4f4f5;
    }
    table.scorecard .score-cell {
      font-weight: 700;
      font-size: 16px;
      white-space: nowrap;
    }
    table.scorecard .level-cell {
      font-size: 18px;
      white-space: nowrap;
    }
    table.scorecard .impact-cell {
      color: #a1a1aa;
      font-size: 13px;
    }

    /* Per-pillar detail card */
    .pillar-detail {
      background: #18181b;
      border-radius: 10px;
      padding: 22px 24px;
      margin-bottom: 16px;
      border: 1px solid #27272a;
      border-left-width: 4px;
    }
    .pillar-detail.level-exceptional { border-left-color: #10b981; }
    .pillar-detail.level-developing { border-left-color: #f59e0b; }
    .pillar-detail.level-poor { border-left-color: #ef4444; }
    .pillar-detail h3 {
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 16px;
      font-weight: 700;
      margin-bottom: 14px;
    }
    .pillar-detail .pillar-score {
      margin-left: auto;
      font-size: 13px;
      font-weight: 600;
      padding: 4px 10px;
      border-radius: 6px;
      background: rgba(255,255,255,0.05);
    }
    .pillar-subsection {
      margin-top: 12px;
    }
    .pillar-subsection .label {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #71717a;
      font-weight: 600;
      margin-bottom: 4px;
    }
    .pillar-subsection .content {
      color: #d4d4d8;
      font-size: 13.5px;
    }
    .pillar-subsection .content.quote {
      font-style: italic;
      color: #a1a1aa;
      border-left: 2px solid #3f3f46;
      padding-left: 12px;
    }
    .pillar-subsection.prescribed .content {
      background: rgba(16, 185, 129, 0.08);
      border: 1px solid rgba(16, 185, 129, 0.25);
      border-radius: 6px;
      padding: 12px 14px;
      color: #e4e4e7;
    }

    /* Critical moment */
    .critical-moment {
      background: rgba(245, 158, 11, 0.08);
      border: 1px solid rgba(245, 158, 11, 0.3);
      border-left: 4px solid #f59e0b;
    }
    .critical-moment h2 { color: #fbbf24; }
    .critical-moment .content {
      color: #e4e4e7;
      white-space: pre-wrap;
      font-size: 14px;
    }

    /* Pattern flags */
    .pattern-flag {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 10px 12px;
      background: rgba(239, 68, 68, 0.08);
      border: 1px solid rgba(239, 68, 68, 0.25);
      border-radius: 6px;
      margin-bottom: 8px;
      color: #fca5a5;
      font-size: 13px;
    }
    .pattern-flag::before {
      content: "⚠";
      font-size: 14px;
      margin-top: 1px;
    }
    .no-flags {
      color: #71717a;
      font-style: italic;
      font-size: 13px;
    }

    /* Action items */
    .action-item {
      display: flex;
      gap: 12px;
      padding: 12px 0;
      border-bottom: 1px solid #27272a;
    }
    .action-item:last-child { border-bottom: none; }
    .action-item .number {
      flex-shrink: 0;
      width: 26px;
      height: 26px;
      border-radius: 50%;
      background: rgba(16, 185, 129, 0.15);
      color: #10b981;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 13px;
    }
    .action-item .text {
      flex: 1;
      color: #d4d4d8;
      font-size: 13.5px;
    }

    /* Print */
    @media print {
      body { background: white; color: black; padding: 16px; }
      .section, .pillar-detail { background: #f5f5f5; border-color: #ddd; }
      .critical-moment { background: #fffbeb; }
      table.scorecard th { color: #555; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="header-row">
        <div style="flex:1;">
          <h1>Call QA Report</h1>
          ${businessName ? `<div class="business-subtitle">${escapeHtml(leadName)} · ${escapeHtml(businessName)}</div>` : `<div class="business-subtitle">${escapeHtml(leadName)}</div>`}
          <div class="meta">
            <span>Closer: <strong>${escapeHtml(closerName)}</strong></span>
            <span>Date: <strong>${callDate}</strong></span>
            <span>Duration: <strong>${duration}</strong></span>
          </div>
        </div>
        ${bodyHtml.badge}
      </div>
    </div>

    ${bodyHtml.main}
  </div>
</body>
</html>`;

    return new NextResponse(html, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// ───────────────────────────────────────────────────────────────────
// V2 renderer (5 pillars, 1-10 scoring, GPT-4o output)
// ───────────────────────────────────────────────────────────────────

function renderV2(analysis: QAAnalysisResultV2): {
  badge: string;
  main: string;
} {
  const colors = levelColors(analysis.overall);

  const badge = `
    <div class="big-score" style="border-color:${colors.border};background:${colors.bg};color:${colors.fg};">
      <div class="value">${analysis.total_score}</div>
      <div class="unit">/ 50</div>
      <div class="avg">Avg ${analysis.avg_score.toFixed(1)}/10</div>
    </div>`;

  // Scorecard table
  const scorecardRows = analysis.pillars
    .map((p) => {
      const cs = levelColors(p.level);
      return `<tr>
      <td class="pillar-name">${escapeHtml(p.name)}</td>
      <td class="score-cell" style="color:${cs.fg};">${p.score}/10</td>
      <td class="level-cell">${p.emoji}</td>
      <td class="impact-cell">${p.impact ? escapeHtml(p.impact) : "—"}</td>
    </tr>`;
    })
    .join("");

  const scorecardHtml = `
    <div class="section">
      <h2>Scorecard Summary</h2>
      <table class="scorecard">
        <thead>
          <tr>
            <th>Pillar</th>
            <th>Score</th>
            <th>Level</th>
            <th>Impact</th>
          </tr>
        </thead>
        <tbody>
          ${scorecardRows || '<tr><td colspan="4" style="color:#71717a;padding:14px;">No pillars extracted from analysis</td></tr>'}
        </tbody>
      </table>
    </div>`;

  // Per-pillar detail cards
  const pillarCards = analysis.pillars
    .map((p) => renderPillarCard(p))
    .join("");

  // Critical moment
  const criticalMomentHtml = analysis.critical_moment
    ? `
    <div class="section critical-moment">
      <h2>The Critical Moment</h2>
      <div class="content">${escapeHtml(analysis.critical_moment)}</div>
    </div>`
    : "";

  // Pattern flags
  const patternFlagsHtml = `
    <div class="section">
      <h2>Closing Intelligence — Pattern Flags</h2>
      ${
        analysis.pattern_flags.length > 0
          ? analysis.pattern_flags
              .map(
                (flag) =>
                  `<div class="pattern-flag">${escapeHtml(flag)}</div>`
              )
              .join("")
          : '<div class="no-flags">No negative patterns detected in this call.</div>'
      }
    </div>`;

  // Action items
  const actionItemsHtml =
    analysis.action_items.length > 0
      ? `
    <div class="section">
      <h2>Priority Action Items</h2>
      ${analysis.action_items
        .map(
          (item, idx) => `
        <div class="action-item">
          <div class="number">${idx + 1}</div>
          <div class="text">${escapeHtml(item)}</div>
        </div>`
        )
        .join("")}
    </div>`
      : "";

  const main =
    scorecardHtml +
    pillarCards +
    criticalMomentHtml +
    patternFlagsHtml +
    actionItemsHtml;

  return { badge, main };
}

function renderPillarCard(p: QAPillarResult): string {
  const sections: string[] = [];

  if (p.client_signal) {
    sections.push(`
      <div class="pillar-subsection">
        <div class="label">Client Signal</div>
        <div class="content quote">${escapeHtml(p.client_signal)}</div>
      </div>`);
  }

  if (p.rep_response) {
    sections.push(`
      <div class="pillar-subsection">
        <div class="label">Rep Response</div>
        <div class="content quote">${escapeHtml(p.rep_response)}</div>
      </div>`);
  }

  if (p.diagnosis) {
    sections.push(`
      <div class="pillar-subsection">
        <div class="label">Diagnosis</div>
        <div class="content">${escapeHtml(p.diagnosis)}</div>
      </div>`);
  }

  if (p.prescribed_fix) {
    sections.push(`
      <div class="pillar-subsection prescribed">
        <div class="label">Prescribed Fix — Script to Memorize</div>
        <div class="content">${escapeHtml(p.prescribed_fix)}</div>
      </div>`);
  }

  // If nothing was extracted, skip the per-pillar card (scorecard still shows it)
  if (sections.length === 0) return "";

  return `
    <div class="pillar-detail level-${p.level}">
      <h3>
        ${p.emoji}
        <span>${escapeHtml(p.name)}</span>
        <span class="pillar-score">${p.score}/10</span>
      </h3>
      ${sections.join("")}
    </div>`;
}

// ───────────────────────────────────────────────────────────────────
// Legacy V1 renderer (Claude-era good/partial/missed)
// ───────────────────────────────────────────────────────────────────

function renderLegacy(analysis: LegacyAIAnalysis | null): {
  badge: string;
  main: string;
} {
  // Legacy `overall` field may be a number (0-100) or a string (green/yellow/red).
  const overallRaw = analysis?.overall;
  let overallNum = 0;
  if (typeof overallRaw === "number") {
    overallNum = overallRaw;
  } else if (typeof overallRaw === "string") {
    overallNum =
      overallRaw === "green" ? 80 : overallRaw === "yellow" ? 50 : 25;
  }

  const colors =
    overallNum >= 80
      ? levelColors("exceptional")
      : overallNum >= 50
        ? levelColors("developing")
        : levelColors("poor");

  const badge = `
    <div class="big-score" style="border-color:${colors.border};background:${colors.bg};color:${colors.fg};">
      <div class="value">${overallNum}</div>
      <div class="unit">/ 100</div>
    </div>`;

  if (!analysis) {
    return {
      badge,
      main: `<div class="section"><h2>No Analysis Available</h2><div style="color:#71717a;">This call has not been analyzed yet.</div></div>`,
    };
  }

  const countChips = `
    <div class="section">
      <h2>Score Summary (Legacy Format)</h2>
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        <span style="padding:6px 14px;border-radius:6px;font-size:12px;font-weight:600;background:rgba(16,185,129,0.15);color:#10b981;">Good: ${analysis.good_count ?? 0}</span>
        <span style="padding:6px 14px;border-radius:6px;font-size:12px;font-weight:600;background:rgba(245,158,11,0.15);color:#f59e0b;">Partial: ${analysis.partial_count ?? 0}</span>
        <span style="padding:6px 14px;border-radius:6px;font-size:12px;font-weight:600;background:rgba(239,68,68,0.15);color:#ef4444;">Missed: ${analysis.missed_count ?? 0}</span>
      </div>
    </div>`;

  const criteriaRows = (analysis.criteria ?? [])
    .map((c) => {
      const norm = c.score?.toLowerCase() ?? "";
      const color =
        norm === "good"
          ? "#10b981"
          : norm === "partial"
            ? "#f59e0b"
            : "#ef4444";
      const label =
        norm === "good"
          ? "Good"
          : norm === "partial"
            ? "Partial"
            : "Missed";
      return `<tr>
        <td class="pillar-name">${escapeHtml(c.name)}</td>
        <td class="score-cell" style="color:${color};">${label}</td>
        <td class="impact-cell">${escapeHtml(c.feedback || "—")}</td>
      </tr>`;
    })
    .join("");

  const criteriaTable = `
    <div class="section">
      <h2>Criteria</h2>
      <table class="scorecard">
        <thead>
          <tr><th>Criterion</th><th>Score</th><th>Feedback</th></tr>
        </thead>
        <tbody>
          ${criteriaRows || '<tr><td colspan="3" style="color:#71717a;padding:14px;">No criteria data</td></tr>'}
        </tbody>
      </table>
    </div>`;

  return { badge, main: countChips + criteriaTable };
}

// ───────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────

function levelColors(level: PillarLevel): {
  fg: string;
  bg: string;
  border: string;
} {
  switch (level) {
    case "exceptional":
      return {
        fg: "#10b981",
        bg: "rgba(16,185,129,0.1)",
        border: "rgba(16,185,129,0.4)",
      };
    case "developing":
      return {
        fg: "#f59e0b",
        bg: "rgba(245,158,11,0.1)",
        border: "rgba(245,158,11,0.4)",
      };
    case "poor":
      return {
        fg: "#ef4444",
        bg: "rgba(239,68,68,0.1)",
        border: "rgba(239,68,68,0.4)",
      };
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
