"use client";

import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUserOrg } from "@/hooks/useCurrentUserOrg";
import dynamic from "next/dynamic";
import { SuggestionsBanner } from "./SuggestionsBanner";
import { CloserRankingPanel } from "./CloserRankingPanel";
import { ProcessingStatusBanner } from "./ProcessingStatusBanner";
import { DrillDownPanel, type DrillDownFilter } from "./DrillDownPanel";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Phone,
  TrendingUp,
  Heart,
  AlertTriangle,
} from "lucide-react";

const SentimentChart = dynamic(
  () => import("./SentimentChart").then((m) => ({ default: m.SentimentChart })),
  { loading: () => <Skeleton className="h-[320px] w-full rounded-xl" /> }
);

const EvaluationScoreChart = dynamic(
  () => import("./EvaluationScoreChart").then((m) => ({ default: m.EvaluationScoreChart })),
  { loading: () => <Skeleton className="h-[320px] w-full rounded-xl" /> }
);

const QACriteriaChart = dynamic(
  () => import("./QACriteriaChart").then((m) => ({ default: m.QACriteriaChart })),
  { loading: () => <Skeleton className="h-[320px] w-full rounded-xl" /> }
);

// ---------- Aggregate KPI Row ----------

function AggregateKPIs() {
  const supabase = createClient();
  const { data: userOrg } = useCurrentUserOrg();
  const orgId = userOrg?.orgId;
  const { data, isLoading } = useQuery({
    queryKey: ["voc-aggregate-kpis", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data: calls } = await supabase
        .from("call_recordings")
        .select("evaluation_score, sentiment_score, is_critical")
        .eq("org_id", orgId!);

      if (!calls || calls.length === 0) {
        return { total: 0, avgScore: 0, avgSentiment: 0, critical: 0 };
      }

      let scoreSum = 0;
      let scoreCount = 0;
      let sentSum = 0;
      let sentCount = 0;
      let critical = 0;

      for (const c of calls) {
        if (c.evaluation_score != null) {
          scoreSum += Number(c.evaluation_score);
          scoreCount++;
        }
        if (c.sentiment_score != null) {
          sentSum += Number(c.sentiment_score);
          sentCount++;
        }
        if (c.is_critical) critical++;
      }

      return {
        total: calls.length,
        avgScore: scoreCount ? scoreSum / scoreCount : 0,
        avgSentiment: sentCount ? sentSum / sentCount : 0,
        critical,
      };
    },
    staleTime: 2 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-24 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  const kpis = [
    {
      label: "Total Calls Analyzed",
      value: data?.total ?? 0,
      icon: Phone,
      color: "text-blue-400",
    },
    {
      label: "Avg Score",
      value: (data?.avgScore ?? 0).toFixed(1),
      icon: TrendingUp,
      color: "text-emerald-400",
    },
    {
      label: "Avg Sentiment",
      value: (data?.avgSentiment ?? 0).toFixed(2),
      icon: Heart,
      color: "text-pink-400",
    },
    {
      label: "Critical Calls",
      value: data?.critical ?? 0,
      icon: AlertTriangle,
      color: "text-red-400",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {kpis.map((k) => (
        <Card key={k.label} className="bg-zinc-900/80 border-zinc-800">
          <CardContent className="p-4 flex items-center gap-3">
            <k.icon className={`h-8 w-8 ${k.color}`} />
            <div>
              <p className="text-2xl font-bold">{k.value}</p>
              <p className="text-xs text-muted-foreground">{k.label}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ---------- Main Page ----------

export default function VoCPage() {
  const [drillDown, setDrillDown] = useState<{
    title: string;
    filter: DrillDownFilter;
  } | null>(null);

  const handleDrillDown = useCallback(
    (title: string, filter: DrillDownFilter) => {
      setDrillDown({ title, filter });
    },
    []
  );

  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-semibold">
        Closing Intelligence
      </h1>

      <ProcessingStatusBanner />

      {/* Aggregate KPI row */}
      <AggregateKPIs />

      <SuggestionsBanner />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <CloserRankingPanel />
        </div>
        <div className="lg:col-span-2 space-y-6">
          <SentimentChart onDrillDown={handleDrillDown} />
          <EvaluationScoreChart onDrillDown={handleDrillDown} />
          <QACriteriaChart onDrillDown={handleDrillDown} />
        </div>
      </div>

      {/* Drill-down panel (rendered once, controlled by state) */}
      <DrillDownPanel
        open={!!drillDown}
        onClose={() => setDrillDown(null)}
        title={drillDown?.title ?? ""}
        filter={drillDown?.filter ?? {}}
      />
    </div>
  );
}
