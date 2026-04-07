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
import type { DrillDownFilter } from "./DrillDownPanel";
import { useCurrentUserOrg } from "@/hooks/useCurrentUserOrg";

interface SentimentChartProps {
  onDrillDown?: (title: string, filter: DrillDownFilter) => void;
}

export function SentimentChart({ onDrillDown }: SentimentChartProps) {
  const supabase = createClient();
  const { data: userOrg } = useCurrentUserOrg();
  const orgId = userOrg?.orgId;
  const { data, isLoading } = useQuery({
    queryKey: ["sentiment-by-day", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const start = new Date();
      start.setDate(start.getDate() - 30);
      const { data: calls } = await supabase
        .from("call_recordings")
        .select("call_date, sentiment_score")
        .eq("org_id", orgId!)
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
    <Card className="bg-zinc-900/80 border-zinc-800">
      <CardHeader>
        <CardTitle className="font-heading text-lg">Sentiment over time</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
            <XAxis
              dataKey="date"
              stroke="#71717a"
              tick={{ fill: "#a1a1aa", fontSize: 12 }}
              tickFormatter={(v) => (v ? v.slice(5) : v)}
            />
            <YAxis
              domain={[-1, 1]}
              stroke="#71717a"
              tick={{ fill: "#a1a1aa", fontSize: 12 }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#27272a",
                border: "1px solid #3f3f46",
                borderRadius: "0.5rem",
              }}
            />
            <Line
              type="monotone"
              dataKey="sentiment"
              stroke="#10b981"
              strokeWidth={2}
              dot={{ fill: "#10b981" }}
              activeDot={{
                r: 6,
                className: "cursor-pointer",
                onClick: (_e: unknown, payload: { payload?: { date?: string } }) => {
                  if (onDrillDown && payload?.payload?.date) {
                    onDrillDown(`Calls on ${payload.payload.date}`, {
                      date: payload.payload.date,
                    });
                  }
                },
              }}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
