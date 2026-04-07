"use client";

import { useQuery } from "@tanstack/react-query";
import { DateRange } from "react-day-picker";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUserOrg } from "@/hooks/useCurrentUserOrg";
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
const SELECTED_COLOR = "#3b82f6";

interface Props {
  dateRange: DateRange;
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
}

function rangeBounds(dateRange: DateRange) {
  const from = dateRange.from?.toISOString() ?? new Date().toISOString();
  const to = dateRange.to
    ? new Date(
        dateRange.to.getFullYear(),
        dateRange.to.getMonth(),
        dateRange.to.getDate(),
        23,
        59,
        59
      ).toISOString()
    : new Date().toISOString();
  return { from, to };
}

export function DailyBarChart({ dateRange, selectedDate, onSelectDate }: Props) {
  const supabase = createClient();
  const { from, to } = rangeBounds(dateRange);
  const { data: userOrg } = useCurrentUserOrg();
  const orgId = userOrg?.orgId;

  const { data, isLoading } = useQuery({
    queryKey: ["live-transfers-daily", orgId, from, to],
    enabled: !!orgId,
    queryFn: async () => {
      const { data: transfers } = await supabase
        .from("live_transfers")
        .select("transfer_date")
        .eq("org_id", orgId!)
        .gte("transfer_date", from)
        .lte("transfer_date", to);
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
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-heading text-lg font-medium">Live transfers by day</h2>
        {selectedDate && (
          <button
            onClick={() => onSelectDate(selectedDate)}
            className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
          >
            Clear filter ({selectedDate})
          </button>
        )}
      </div>
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
            cursor={{ fill: "rgba(255,255,255,0.04)" }}
            contentStyle={{
              backgroundColor: "#27272a",
              border: "1px solid #3f3f46",
              borderRadius: "0.5rem",
            }}
            labelFormatter={(v) => (v === "—" ? v : v)}
          />
          <Bar
            dataKey="count"
            radius={[4, 4, 0, 0]}
            onClick={(payload) => {
              const date = (payload as { date?: string })?.date;
              if (date && date !== "—") onSelectDate(date);
            }}
            cursor="pointer"
          >
            {chartData.map((entry, i) => {
              const isSelected = entry.date === selectedDate;
              const isDimmed = selectedDate && !isSelected && entry.date !== "—";
              return (
                <Cell
                  key={i}
                  fill={isSelected ? SELECTED_COLOR : COLORS[i % COLORS.length]}
                  opacity={isDimmed ? 0.3 : 1}
                />
              );
            })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
