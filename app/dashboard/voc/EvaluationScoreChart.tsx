"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function EvaluationScoreChart() {
  const supabase = createClient();
  const { data, isLoading } = useQuery({
    queryKey: ["avg-score-by-closer"],
    queryFn: async () => {
      const { data: closers } = await supabase
        .from("closers")
        .select("id, name")
        .eq("active", true);
      if (!closers?.length) return { data: [], avg: 0 };
      const { data: calls } = await supabase
        .from("call_recordings")
        .select("closer_id, evaluation_score");
      const byCloser: Record<string, { sum: number; count: number }> = {};
      closers.forEach((c) => {
        byCloser[c.id] = { sum: 0, count: 0 };
      });
      (calls ?? []).forEach((c) => {
        const o = byCloser[c.closer_id];
        if (!o) return;
        o.sum += Number(c.evaluation_score ?? 0);
        o.count += 1;
      });
      let totalSum = 0;
      let totalCount = 0;
      const data = closers.map((cl) => {
        const o = byCloser[cl.id];
        const avg = o?.count ? o.sum / o.count : 0;
        totalSum += avg * (o?.count ?? 0);
        totalCount += o?.count ?? 0;
        return { name: cl.name, score: Math.round(avg * 10) / 10 };
      });
      const avg = totalCount ? totalSum / totalCount : 0;
      return { data, avg };
    },
  });

  if (isLoading) return <Skeleton className="h-[280px] w-full rounded-xl" />;

  const chartData = data?.data?.length ? data.data : [{ name: "—", score: 0 }];
  const orgAvg = data?.avg ?? 0;

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="font-heading text-lg">
          Avg evaluation score by closer
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 8, right: 8, left: 60, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis type="number" domain={[0, 100]} stroke="var(--color-muted-foreground)" tick={{ fill: "var(--color-muted-foreground)" }} />
            <YAxis type="category" dataKey="name" stroke="var(--color-muted-foreground)" tick={{ fill: "var(--color-muted-foreground)", fontSize: 12 }} width={80} />
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--color-card)",
                border: "1px solid var(--color-border)",
                borderRadius: "0.5rem",
              }}
            />
            <ReferenceLine x={orgAvg} stroke="var(--color-warning)" strokeDasharray="3 3" />
            <Bar dataKey="score" fill="var(--color-success)" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
