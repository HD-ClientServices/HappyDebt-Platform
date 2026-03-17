"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function SentimentChart() {
  const supabase = createClient();
  const { data, isLoading } = useQuery({
    queryKey: ["sentiment-by-day"],
    queryFn: async () => {
      const start = new Date();
      start.setDate(start.getDate() - 30);
      const { data: calls } = await supabase
        .from("call_recordings")
        .select("call_date, sentiment_score")
        .gte("call_date", start.toISOString());
      const byDay: Record<string, { sum: number; count: number }> = {};
      (calls ?? []).forEach((c) => {
        const d = new Date(c.call_date).toISOString().slice(0, 10);
        if (!byDay[d]) byDay[d] = { sum: 0, count: 0 };
        byDay[d].sum += Number(c.sentiment_score ?? 0);
        byDay[d].count += 1;
      });
      return Object.entries(byDay)
        .map(([date, v]) => ({
          date,
          sentiment: v.count ? v.sum / v.count : 0,
        }))
        .sort((a, b) => a.date.localeCompare(b.date));
    },
  });

  if (isLoading) return <Skeleton className="h-[280px] w-full rounded-xl" />;

  const chartData = data?.length ? data : [{ date: "", sentiment: 0 }];

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="font-heading text-lg">Sentiment over time</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis
              dataKey="date"
              stroke="var(--color-muted-foreground)"
              tick={{ fill: "var(--color-muted-foreground)", fontSize: 12 }}
              tickFormatter={(v) => (v ? v.slice(5) : v)}
            />
            <YAxis
              domain={[-1, 1]}
              stroke="var(--color-muted-foreground)"
              tick={{ fill: "var(--color-muted-foreground)", fontSize: 12 }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--color-card)",
                border: "1px solid var(--color-border)",
                borderRadius: "0.5rem",
              }}
            />
            <Line
              type="monotone"
              dataKey="sentiment"
              stroke="var(--color-success)"
              strokeWidth={2}
              dot={{ fill: "var(--color-success)" }}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
