import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();

  const [{ data: closers }, { data: calls }] = await Promise.all([
    supabase.from("closers").select("id, name, avatar_url").eq("active", true),
    supabase
      .from("call_recordings")
      .select("closer_id, evaluation_score, sentiment_score, is_critical"),
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
