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

const COLORS = ["#10b981", "#f43f5e", "#f59e0b", "#0ea5e9", "#71717a"];

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
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-4">
      <h2 className="font-heading text-lg font-medium mb-4">
        Live transfers by day
      </h2>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
          <XAxis
            dataKey="date"
            stroke="#71717a"
            tick={{ fill: "#a1a1aa", fontSize: 12 }}
            tickFormatter={(v) => (v === "—" ? v : v.slice(5))}
          />
          <YAxis stroke="#71717a" tick={{ fill: "#a1a1aa", fontSize: 12 }} />
          <Tooltip
            contentStyle={{
              backgroundColor: "#27272a",
              border: "1px solid #3f3f46",
              borderRadius: "0.5rem",
            }}
            labelFormatter={(v) => (v === "—" ? v : v)}
          />
          <Bar dataKey="count" fill="#10b981" radius={[4, 4, 0, 0]}>
            {chartData.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
