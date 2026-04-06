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
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { DrillDownFilter } from "./DrillDownPanel";

interface QACriteriaChartProps {
  onDrillDown?: (title: string, filter: DrillDownFilter) => void;
}

const CRITERIA_NAMES = [
  "Industry Explanation",
  "Urgency",
  "Clear CTA",
  "Confirmation Lock-in",
  "Intensity Under Resistance",
];

interface CriterionData {
  name: string;
  good: number;
  partial: number;
  missed: number;
}

export function QACriteriaChart({ onDrillDown }: QACriteriaChartProps) {
  const supabase = createClient();

  const { data, isLoading } = useQuery({
    queryKey: ["qa-criteria-distribution"],
    queryFn: async () => {
      const { data: calls } = await supabase
        .from("call_recordings")
        .select("criteria_scores")
        .not("criteria_scores", "is", null);

      if (!calls || calls.length === 0) return [] as CriterionData[];

      // Aggregate scores across all calls
      const agg: Record<string, { good: number; partial: number; missed: number }> = {};
      CRITERIA_NAMES.forEach((name) => {
        agg[name] = { good: 0, partial: 0, missed: 0 };
      });

      for (const call of calls) {
        const scores = call.criteria_scores as Record<string, string> | null;
        if (!scores) continue;

        // Map criteria keys to display names
        const keys = Object.keys(scores);
        keys.forEach((key, i) => {
          const displayName = CRITERIA_NAMES[i] || key;
          if (!agg[displayName]) agg[displayName] = { good: 0, partial: 0, missed: 0 };

          const score = (scores[key] || "").toLowerCase();
          if (score.includes("good") || score === "good") {
            agg[displayName].good++;
          } else if (score.includes("partial") || score === "partial") {
            agg[displayName].partial++;
          } else if (score.includes("missed") || score === "missed") {
            agg[displayName].missed++;
          }
        });
      }

      return Object.entries(agg).map(([name, counts]) => ({
        name: name.length > 20 ? name.slice(0, 18) + "…" : name,
        fullName: name,
        ...counts,
      }));
    },
  });

  if (isLoading) return <Skeleton className="h-[320px] w-full rounded-xl" />;

  if (!data || data.length === 0) {
    return (
      <Card className="bg-zinc-900/80 border-zinc-800">
        <CardHeader>
          <CardTitle className="font-heading text-lg">
            QA Criteria Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground py-8 text-center">
            No analyzed calls yet. Calls will appear here after processing.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-zinc-900/80 border-zinc-800">
      <CardHeader>
        <CardTitle className="font-heading text-lg">
          QA Criteria Breakdown
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Distribution of Good / Partial / Missed across 5 evaluation criteria
        </p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart
            data={data}
            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
            <XAxis
              dataKey="name"
              stroke="#71717a"
              tick={{ fill: "#a1a1aa", fontSize: 11 }}
              angle={-15}
              textAnchor="end"
              height={60}
            />
            <YAxis stroke="#71717a" tick={{ fill: "#a1a1aa", fontSize: 12 }} />
            <Tooltip
              contentStyle={{
                backgroundColor: "#27272a",
                border: "1px solid #3f3f46",
                borderRadius: "0.5rem",
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }}
            />
            <Bar
              dataKey="good"
              fill="#10b981"
              name="Good"
              radius={[4, 4, 0, 0]}
              className="cursor-pointer"
              onClick={(payload: { fullName?: string }) => {
                if (onDrillDown && payload?.fullName) {
                  onDrillDown(`${payload.fullName} — Good`, {
                    criterionName: payload.fullName,
                    scoreType: "good",
                  });
                }
              }}
            />
            <Bar
              dataKey="partial"
              fill="#f59e0b"
              name="Partial"
              radius={[4, 4, 0, 0]}
              className="cursor-pointer"
              onClick={(payload: { fullName?: string }) => {
                if (onDrillDown && payload?.fullName) {
                  onDrillDown(`${payload.fullName} — Partial`, {
                    criterionName: payload.fullName,
                    scoreType: "partial",
                  });
                }
              }}
            />
            <Bar
              dataKey="missed"
              fill="#ef4444"
              name="Missed"
              radius={[4, 4, 0, 0]}
              className="cursor-pointer"
              onClick={(payload: { fullName?: string }) => {
                if (onDrillDown && payload?.fullName) {
                  onDrillDown(`${payload.fullName} — Missed`, {
                    criterionName: payload.fullName,
                    scoreType: "missed",
                  });
                }
              }}
            />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
