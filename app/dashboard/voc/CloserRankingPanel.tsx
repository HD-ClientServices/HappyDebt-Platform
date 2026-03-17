"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export function CloserRankingPanel() {
  const router = useRouter();
  const supabase = createClient();
  const { data: closers, isLoading } = useQuery({
    queryKey: ["closers-with-stats"],
    queryFn: async () => {
      const { data: c } = await supabase
        .from("closers")
        .select("id, name, avatar_url")
        .eq("active", true);
      if (!c?.length) return [];
      const { data: calls } = await supabase
        .from("call_recordings")
        .select("closer_id, evaluation_score, sentiment_score, is_critical");
      const byCloser: Record<
        string,
        { avgScore: number; count: number; avgSentiment: number; critical: number }
      > = {};
      c.forEach((cl) => {
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
      Object.keys(byCloser).forEach((id) => {
        const o = byCloser[id];
        if (o.count > 0) {
          o.avgScore /= o.count;
          o.avgSentiment /= o.count;
        }
      });
      return c
        .map((cl) => ({
          ...cl,
          ...byCloser[cl.id],
        }))
        .sort((a, b) => (b.avgScore ?? 0) - (a.avgScore ?? 0));
    },
  });

  if (isLoading) {
    return (
      <Card className="bg-card border-border">
        <CardHeader>
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent>
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-14 w-full mb-2" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="font-heading text-lg">Closer ranking</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {(closers ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No closers yet.</p>
        ) : (
          (closers ?? []).map((c: { id: string; name: string; avatar_url?: string; avgScore?: number; count?: number; critical?: number }) => (
            <button
              key={c.id}
              type="button"
              onClick={() => router.push(`/dashboard/voc/${c.id}`)}
              className="w-full flex items-center gap-3 rounded-lg p-2 text-left hover:bg-muted/50 transition-colors"
            >
              <Avatar className="h-9 w-9">
                <AvatarImage src={c.avatar_url} />
                <AvatarFallback className="bg-muted text-xs">
                  {c.name.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{c.name}</p>
                <p className="text-xs text-muted-foreground">
                  Avg {c.avgScore != null ? c.avgScore.toFixed(1) : "—"} · {c.count ?? 0} calls
                  {c.critical ? (
                    <Badge variant="destructive" className="ml-1 text-xs">
                      {c.critical} critical
                    </Badge>
                  ) : null}
                </p>
              </div>
            </button>
          ))
        )}
      </CardContent>
    </Card>
  );
}
