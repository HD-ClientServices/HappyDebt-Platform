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
  Cell,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";

/* Design-system chart palette */
const COLORS = ["var(--color-success)", "var(--color-destructive)", "var(--color-warning)", "var(--color-primary)", "var(--color-muted-foreground)"];

export function DailyBarChart() {
  const supabase = createClient();
  const { data, isLoading } = useQuery({
    queryKey: ["live-transfers-daily"],
    queryFn: async () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const { data: transfers } = await supabase
        .from("live_transfers")
        .select("transfer_date")
        .gte("transfer_date", start.toISOString());
      const byDay: Record<string, number> = {};
      (transfers ?? []).forEach((t) => {
        const d = new Date(t.transfer_date).toISOString().slice(0, 10);
        byDay[d] = (byDay[d] ?? 0) + 1;
      });
      const days = Object.entries(byDay).map(([date, count]) => ({ date, count }));
      days.sort((a, b) => a.date.localeCompare(b.date));
      return days;
    },
  });

  if (isLoading) {
    return <Skeleton className="h-[300px] w-full rounded-xl" />;
  }

  const chartData = data?.length ? data : [{ date: "—", count: 0 }];

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h2 className="font-heading text-lg font-medium mb-4">
        Live transfers by day
      </h2>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
          <XAxis
            dataKey="date"
            stroke="var(--color-muted-foreground)"
            tick={{ fill: "var(--color-muted-foreground)", fontSize: 12 }}
            tickFormatter={(v) => (v === "—" ? v : v.slice(5))}
          />
          <YAxis stroke="var(--color-muted-foreground)" tick={{ fill: "var(--color-muted-foreground)", fontSize: 12 }} />
          <Tooltip
            contentStyle={{
              backgroundColor: "var(--color-card)",
              border: "1px solid var(--color-border)",
              borderRadius: "0.5rem",
            }}
            labelFormatter={(v) => (v === "—" ? v : v)}
          />
          <Bar dataKey="count" fill="var(--color-success)" radius={[4, 4, 0, 0]}>
            {chartData.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
