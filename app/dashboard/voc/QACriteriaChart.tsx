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

export function QACriteriaChart() {
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
        ...counts,
      }));
    },
  });

  if (isLoading) return <Skeleton className="h-[320px] w-full rounded-xl" />;

  if (!data || data.length === 0) {
    return (
      <Card className="bg-card border-border">
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
    <Card className="bg-card border-border">
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
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis
              dataKey="name"
              stroke="var(--color-muted-foreground)"
              tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }}
              angle={-15}
              textAnchor="end"
              height={60}
            />
            <YAxis stroke="var(--color-muted-foreground)" tick={{ fill: "var(--color-muted-foreground)", fontSize: 12 }} />
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--color-card)",
                border: "1px solid var(--color-border)",
                borderRadius: "0.5rem",
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }}
            />
            <Bar dataKey="good" fill="var(--color-success)" name="Good" radius={[4, 4, 0, 0]} />
            <Bar dataKey="partial" fill="var(--color-warning)" name="Partial" radius={[4, 4, 0, 0]} />
            <Bar dataKey="missed" fill="var(--color-destructive)" name="Missed" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
