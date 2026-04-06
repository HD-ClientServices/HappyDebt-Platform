import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface QACriterion {
  name: string;
  score: string;
  feedback: string;
}

interface AIAnalysis {
  criteria: QACriterion[];
  overall: number;
  good_count: number;
  partial_count: number;
  missed_count: number;
  raw_analysis?: string;
}

/**
 * GET /api/reports/qa/[callId] - Render QA report as HTML
 *
 * Returns a standalone HTML page with professional dark theme styling.
 * RLS handles org scoping automatically.
 */
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

    const analysis: AIAnalysis | null =
      typeof recording.ai_analysis === "object" ? recording.ai_analysis : null;

    const closerName =
      (recording.closers as { name: string } | null)?.name ?? "Unknown Closer";
    const leadName =
      (recording.leads as { name: string; business_name?: string } | null)
        ?.name ?? "Unknown Lead";
    const callDate = recording.call_date
      ? new Date(recording.call_date).toLocaleString("en-US", {
          dateStyle: "medium",
          timeStyle: "short",
        })
      : "N/A";
    const duration = recording.duration
      ? `${Math.floor(recording.duration / 60)}m ${recording.duration % 60}s`
      : "N/A";

    // Overall score color
    const overallScore = analysis?.overall ?? 0;
    let scoreBadgeColor = "#ef4444"; // red
    let scoreBadgeBg = "rgba(239,68,68,0.15)";
    if (overallScore >= 80) {
      scoreBadgeColor = "#22c55e";
      scoreBadgeBg = "rgba(34,197,94,0.15)";
    } else if (overallScore >= 50) {
      scoreBadgeColor = "#eab308";
      scoreBadgeBg = "rgba(234,179,8,0.15)";
    }

    // Build criteria rows
    const criteriaRows = (analysis?.criteria ?? [])
      .map((c) => {
        let scoreColor = "#ef4444";
        let scoreLabel = c.score;
        if (c.score === "Good" || c.score === "good") {
          scoreColor = "#22c55e";
          scoreLabel = "Good";
        } else if (c.score === "Partial" || c.score === "partial") {
          scoreColor = "#eab308";
          scoreLabel = "Partial";
        } else {
          scoreColor = "#ef4444";
          scoreLabel = "Missed";
        }
        return `<tr>
          <td style="padding:10px 14px;border-bottom:1px solid #27272a;">${escapeHtml(c.name)}</td>
          <td style="padding:10px 14px;border-bottom:1px solid #27272a;"><span style="color:${scoreColor};font-weight:600;">${scoreLabel}</span></td>
          <td style="padding:10px 14px;border-bottom:1px solid #27272a;color:#a1a1aa;">${escapeHtml(c.feedback)}</td>
        </tr>`;
      })
      .join("");

    // Build sections from raw_analysis
    const rawAnalysis = analysis?.raw_analysis ?? "";
    const strengthsSection = extractSection(rawAnalysis, "strengths");
    const improvementsSection = extractSection(rawAnalysis, "improvements");
    const actionSection = extractSection(rawAnalysis, "action");
    const isCritical = overallScore < 50;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>QA Report - ${escapeHtml(leadName)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #09090b; color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 32px; line-height: 1.6; }
    .container { max-width: 900px; margin: 0 auto; }
    .header { margin-bottom: 32px; padding-bottom: 24px; border-bottom: 1px solid #27272a; }
    .header h1 { font-size: 24px; font-weight: 700; margin-bottom: 8px; }
    .meta { display: flex; gap: 24px; flex-wrap: wrap; color: #a1a1aa; font-size: 14px; }
    .meta span { display: flex; align-items: center; gap: 6px; }
    .score-badge { display: inline-flex; align-items: center; justify-content: center; font-size: 36px; font-weight: 700; width: 80px; height: 80px; border-radius: 12px; }
    .header-row { display: flex; justify-content: space-between; align-items: center; }
    table { width: 100%; border-collapse: collapse; background: #18181b; border-radius: 8px; overflow: hidden; margin-bottom: 24px; }
    th { text-align: left; padding: 12px 14px; background: #27272a; color: #a1a1aa; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; }
    .section { background: #18181b; border-radius: 8px; padding: 20px; margin-bottom: 20px; }
    .section h2 { font-size: 16px; font-weight: 600; margin-bottom: 12px; }
    .section ul { list-style: disc; padding-left: 20px; }
    .section li { margin-bottom: 6px; color: #d4d4d8; }
    .section-green { border-left: 3px solid #22c55e; }
    .section-amber { border-left: 3px solid #eab308; }
    .section-red { border-left: 3px solid #ef4444; }
    .counts { display: flex; gap: 16px; margin-bottom: 24px; }
    .count-chip { padding: 6px 14px; border-radius: 6px; font-size: 13px; font-weight: 600; }
    @media print {
      body { background: white; color: black; padding: 16px; }
      .section { background: #f5f5f5; }
      table { background: white; }
      th { background: #e5e5e5; color: #333; }
      .score-badge { border: 2px solid #ccc; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="header-row">
        <div>
          <h1>QA Report: ${escapeHtml(leadName)}</h1>
          <div class="meta">
            <span>Closer: <strong>${escapeHtml(closerName)}</strong></span>
            <span>Date: <strong>${callDate}</strong></span>
            <span>Duration: <strong>${duration}</strong></span>
          </div>
        </div>
        <div class="score-badge" style="color:${scoreBadgeColor};background:${scoreBadgeBg};">
          ${overallScore}
        </div>
      </div>
    </div>

    <div class="counts">
      <span class="count-chip" style="background:rgba(34,197,94,0.15);color:#22c55e;">Good: ${analysis?.good_count ?? 0}</span>
      <span class="count-chip" style="background:rgba(234,179,8,0.15);color:#eab308;">Partial: ${analysis?.partial_count ?? 0}</span>
      <span class="count-chip" style="background:rgba(239,68,68,0.15);color:#ef4444;">Missed: ${analysis?.missed_count ?? 0}</span>
    </div>

    <table>
      <thead>
        <tr>
          <th>Criteria</th>
          <th>Score</th>
          <th>Feedback</th>
        </tr>
      </thead>
      <tbody>
        ${criteriaRows || '<tr><td colspan="3" style="padding:14px;color:#71717a;">No criteria data available</td></tr>'}
      </tbody>
    </table>

    ${
      strengthsSection
        ? `<div class="section section-green">
        <h2 style="color:#22c55e;">Strengths</h2>
        <ul>${strengthsSection}</ul>
      </div>`
        : ""
    }

    ${
      improvementsSection
        ? `<div class="section section-amber">
        <h2 style="color:#eab308;">Areas for Improvement</h2>
        <ul>${improvementsSection}</ul>
      </div>`
        : ""
    }

    ${
      isCritical && actionSection
        ? `<div class="section section-red">
        <h2 style="color:#ef4444;">Action Plan</h2>
        <ul>${actionSection}</ul>
      </div>`
        : ""
    }
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

/* ── Helpers ──────────────────────────────────────────────────────── */

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Extract bullet points from a raw_analysis section.
 * Looks for common patterns like "Strengths:\n- item\n- item"
 */
function extractSection(raw: string, keyword: string): string {
  if (!raw) return "";

  // Match section by keyword (case-insensitive), grab lines until next section or end
  const regex = new RegExp(
    `(?:^|\\n)\\s*(?:#{1,3}\\s*)?${keyword}[^\\n]*\\n([\\s\\S]*?)(?=\\n\\s*(?:#{1,3}\\s*)?(?:strengths|improvements|action|areas|weaknesses|summary)|$)`,
    "i"
  );
  const match = raw.match(regex);
  if (!match?.[1]) return "";

  const lines = match[1]
    .split("\n")
    .map((l) => l.replace(/^[\s\-*]+/, "").trim())
    .filter((l) => l.length > 0);

  return lines.map((l) => `<li>${escapeHtml(l)}</li>`).join("");
}
