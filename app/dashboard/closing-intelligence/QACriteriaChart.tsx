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
import { useCurrentUserOrg } from "@/hooks/useCurrentUserOrg";
import type { QAAnalysisResultV2 } from "@/lib/openai/types";

interface QACriteriaChartProps {
  onDrillDown?: (title: string, filter: DrillDownFilter) => void;
}

/**
 * Aggregated row for the chart: one entry per pillar, with counts of
 * calls that scored in each level bucket.
 */
interface PillarAgg {
  name: string;
  fullName: string;
  exceptional: number;
  developing: number;
  poor: number;
}

/**
 * Break pillar names long enough to truncate cleanly on the x-axis.
 * 20 characters is about the limit before the angled labels start
 * overlapping on 5-column layouts.
 */
function truncate(s: string, max = 20): string {
  return s.length > max ? s.slice(0, max - 2) + "…" : s;
}

export function QACriteriaChart({ onDrillDown }: QACriteriaChartProps) {
  const supabase = createClient();
  const { data: userOrg } = useCurrentUserOrg();
  const orgId = userOrg?.orgId;

  const { data, isLoading } = useQuery({
    queryKey: ["qa-pillar-distribution", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      // Pull ai_analysis for all analyzed calls in the org.
      // We filter to V2 (5-pillar) analyses on the client since the
      // JSONB `->>version` filter is awkward to express in PostgREST.
      const { data: calls } = await supabase
        .from("call_recordings")
        .select("ai_analysis")
        .eq("org_id", orgId!)
        .not("ai_analysis", "is", null);

      if (!calls || calls.length === 0) return [] as PillarAgg[];

      // Aggregate by pillar name. We discover pillar names dynamically
      // from the first V2 analysis and then map all subsequent calls
      // into those buckets.
      const byName = new Map<string, PillarAgg>();

      for (const call of calls) {
        const analysis = call.ai_analysis as Record<string, unknown> | null;
        if (!analysis) continue;
        if (analysis.version !== "v2-5-pillars-gpt4o") continue;

        const pillars = (analysis as unknown as QAAnalysisResultV2).pillars;
        if (!Array.isArray(pillars)) continue;

        for (const p of pillars) {
          if (!p?.name || typeof p.score !== "number") continue;

          let row = byName.get(p.name);
          if (!row) {
            row = {
              name: truncate(p.name),
              fullName: p.name,
              exceptional: 0,
              developing: 0,
              poor: 0,
            };
            byName.set(p.name, row);
          }

          if (p.score >= 8) row.exceptional++;
          else if (p.score >= 5) row.developing++;
          else row.poor++;
        }
      }

      return Array.from(byName.values());
    },
  });

  if (isLoading) return <Skeleton className="h-[320px] w-full rounded-xl" />;

  if (!data || data.length === 0) {
    return (
      <Card className="bg-zinc-900/80 border-zinc-800">
        <CardHeader>
          <CardTitle className="font-heading text-lg">
            QA Pillar Breakdown
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
          QA Pillar Breakdown
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Distribution of scores across 5 closer performance pillars — 🟢
          Exceptional (8-10) · 🟡 Developing (5-7) · 🔴 Poor (1-4)
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
            <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }} />
            {/*
              Recharts Bar onClick gives us (data, index, event). The
              original row lives on `data.payload`. We cast to unknown
              first because recharts' public types don't expose the
              payload shape on BarRectangleItem.
            */}
            <Bar
              dataKey="exceptional"
              fill="#10b981"
              name="Exceptional"
              radius={[4, 4, 0, 0]}
              className="cursor-pointer"
              onClick={(data: unknown) => {
                const row = (data as { payload?: PillarAgg })?.payload;
                if (onDrillDown && row?.fullName) {
                  onDrillDown(`${row.fullName} — Exceptional`, {
                    criterionName: row.fullName,
                    scoreType: "exceptional",
                  });
                }
              }}
            />
            <Bar
              dataKey="developing"
              fill="#f59e0b"
              name="Developing"
              radius={[4, 4, 0, 0]}
              className="cursor-pointer"
              onClick={(data: unknown) => {
                const row = (data as { payload?: PillarAgg })?.payload;
                if (onDrillDown && row?.fullName) {
                  onDrillDown(`${row.fullName} — Developing`, {
                    criterionName: row.fullName,
                    scoreType: "developing",
                  });
                }
              }}
            />
            <Bar
              dataKey="poor"
              fill="#ef4444"
              name="Poor"
              radius={[4, 4, 0, 0]}
              className="cursor-pointer"
              onClick={(data: unknown) => {
                const row = (data as { payload?: PillarAgg })?.payload;
                if (onDrillDown && row?.fullName) {
                  onDrillDown(`${row.fullName} — Poor`, {
                    criterionName: row.fullName,
                    scoreType: "poor",
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
