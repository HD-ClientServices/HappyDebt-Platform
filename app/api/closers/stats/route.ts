import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEffectiveOrgId } from "@/lib/auth/getEffectiveOrgId";

export async function GET(request: Request) {
  const ctx = await getEffectiveOrgId(request);
  if (!ctx.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const orgId = ctx.effectiveOrgId;
  if (!orgId) {
    return NextResponse.json({ error: "No org context" }, { status: 400 });
  }

  const admin = createAdminClient();

  const [{ data: closers }, { data: calls }] = await Promise.all([
    admin
      .from("closers")
      .select("id, name, avatar_url")
      .eq("org_id", orgId)
      .eq("active", true),
    admin
      .from("call_recordings")
      .select("closer_id, evaluation_score, sentiment_score, is_critical")
      .eq("org_id", orgId),
  ]);

  if (!closers?.length) return NextResponse.json([]);

  const byCloser: Record<
    string,
    { avgScore: number; count: number; avgSentiment: number; critical: number }
  > = {};
  closers.forEach((cl) => {
    byCloser[cl.id] = { avgScore: 0, count: 0, avgSentiment: 0, critical: 0 };
  });
  (calls ?? []).forEach((call) => {
    const o = byCloser[call.closer_id];
    if (!o) return;
    o.count += 1;
    o.avgScore += Number(call.evaluation_score ?? 0);
    o.avgSentiment += Number(call.sentiment_score ?? 0);
    if (call.is_critical) o.critical += 1;
  });
  Object.values(byCloser).forEach((o) => {
    if (o.count > 0) {
      o.avgScore /= o.count;
      o.avgSentiment /= o.count;
    }
  });

  const result = closers
    .map((cl) => ({ ...cl, ...byCloser[cl.id] }))
    .sort((a, b) => b.avgScore - a.avgScore);

  return NextResponse.json(result);
}
