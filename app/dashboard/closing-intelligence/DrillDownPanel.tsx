"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useClosers } from "@/hooks/useClosers";
import { useCurrentUserOrg } from "@/hooks/useCurrentUserOrg";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CallAudioPlayer } from "@/components/audio/CallAudioPlayer";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { trackEvent } from "@/lib/plg";
import { useEffect } from "react";
import { Eye, Clock, User } from "lucide-react";
import Link from "next/link";
import type { QAAnalysisResultV2 } from "@/lib/openai/types";

/**
 * Filter shape used to query calls for the drill-down view.
 *
 * `scoreType` values (V2):
 *   - "exceptional"  pillar score 8-10
 *   - "developing"   pillar score 5-7
 *   - "poor"         pillar score 1-4
 *
 * Legacy values ("good" / "partial" / "missed") are still accepted for
 * backward compat with any bookmarked or cached drill-down state, and
 * are mapped to V2 buckets inside the client-side filter below.
 */
export interface DrillDownFilter {
  closerId?: string;
  date?: string;
  criterionName?: string;
  scoreType?: string;
}

/** Map a V2 pillar score (1-10) to a bucket label. */
function scoreToBucket(score: number): "exceptional" | "developing" | "poor" {
  if (score >= 8) return "exceptional";
  if (score >= 5) return "developing";
  return "poor";
}

/** Normalize legacy scoreType strings into V2 buckets. */
function normalizeScoreType(
  raw: string
): "exceptional" | "developing" | "poor" {
  const s = raw.toLowerCase();
  if (s === "exceptional" || s === "good") return "exceptional";
  if (s === "developing" || s === "partial") return "developing";
  return "poor";
}

interface DrillDownPanelProps {
  open: boolean;
  onClose: () => void;
  title: string;
  filter: DrillDownFilter;
}

function scoreColor(score: number | null | undefined): string {
  if (score == null) return "text-muted-foreground";
  if (score >= 70) return "text-emerald-500";
  if (score >= 40) return "text-yellow-500";
  return "text-red-500";
}

function sentimentBadge(s: number | null | undefined) {
  if (s == null) return <Badge variant="outline">--</Badge>;
  if (s >= 0.3) return <Badge className="bg-emerald-900/50 text-emerald-400 border-emerald-800">{s.toFixed(2)}</Badge>;
  if (s >= -0.3) return <Badge className="bg-yellow-900/50 text-yellow-400 border-yellow-800">{s.toFixed(2)}</Badge>;
  return <Badge className="bg-red-900/50 text-red-400 border-red-800">{s.toFixed(2)}</Badge>;
}

export function DrillDownPanel({ open, onClose, title, filter }: DrillDownPanelProps) {
  const supabase = createClient();
  const { data: closers } = useClosers();
  const { data: userOrg } = useCurrentUserOrg();
  const orgId = userOrg?.orgId;

  // Track drilldown open
  useEffect(() => {
    if (open) {
      trackEvent("voc_drilldown", { title, ...filter });
    }
  }, [open, title, filter]);

  const { data: calls, isLoading } = useQuery({
    queryKey: ["drilldown-calls", orgId, filter],
    enabled: open && !!orgId,
    queryFn: async () => {
      let query = supabase
        .from("call_recordings")
        .select(
          "id, call_date, closer_id, evaluation_score, sentiment_score, duration_seconds, recording_url, ai_analysis, contact_name, business_name"
        )
        .eq("org_id", orgId!)
        .order("call_date", { ascending: false })
        .limit(50);

      if (filter.closerId) {
        query = query.eq("closer_id", filter.closerId);
      }

      if (filter.date) {
        // Match calls on a specific date
        const dayStart = `${filter.date}T00:00:00`;
        const dayEnd = `${filter.date}T23:59:59`;
        query = query.gte("call_date", dayStart).lte("call_date", dayEnd);
      }

      // Pillar filtering happens client-side: we need to walk
      // ai_analysis.pillars[] and compare the score of the matching
      // pillar name against the requested bucket.
      const { data } = await query;
      let results = data ?? [];

      if (filter.criterionName && filter.scoreType) {
        const targetBucket = normalizeScoreType(filter.scoreType);
        const targetName = filter.criterionName.toLowerCase();

        results = results.filter((call) => {
          const analysis = call.ai_analysis as Record<string, unknown> | null;
          if (!analysis) return false;
          if (analysis.version !== "v2-5-pillars-gpt4o") return false;

          const pillars = (analysis as unknown as QAAnalysisResultV2).pillars;
          if (!Array.isArray(pillars)) return false;

          return pillars.some((p) => {
            if (!p?.name || typeof p.score !== "number") return false;
            if (p.name.toLowerCase() !== targetName) return false;
            return scoreToBucket(p.score) === targetBucket;
          });
        });
      }

      return results;
    },
  });

  const getCloserName = (id: string) =>
    closers?.find((c) => c.id === id)?.name ?? "--";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-heading">{title}</DialogTitle>
          <p className="text-sm text-muted-foreground">
            {calls?.length ?? 0} calls found
          </p>
        </DialogHeader>

        <ScrollArea className="flex-1 -mx-4 px-4">
          {isLoading ? (
            <div className="space-y-3 py-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20 w-full rounded-lg" />
              ))}
            </div>
          ) : !calls || calls.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No calls match this filter.
            </p>
          ) : (
            <div className="space-y-3 py-4">
              {calls.map((call) => (
                <div
                  key={call.id}
                  className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 space-y-2"
                >
                  {/* Header row */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">
                        {new Date(call.call_date).toLocaleDateString("es-CL", {
                          timeZone: "America/Santiago",
                        })}
                      </span>
                      <span className="text-muted-foreground">·</span>
                      <span className="flex items-center gap-1">
                        <User className="h-3.5 w-3.5 text-muted-foreground" />
                        {getCloserName(call.closer_id)}
                      </span>
                      {call.contact_name && (
                        <>
                          <span className="text-muted-foreground">·</span>
                          <span className="truncate max-w-[120px]">
                            {call.contact_name}
                          </span>
                        </>
                      )}
                    </div>
                    <Link href={`/api/reports/qa/${call.id}`}>
                      <Button variant="ghost" size="sm" className="h-7 gap-1">
                        <Eye className="h-3.5 w-3.5" />
                        QA Report
                      </Button>
                    </Link>
                  </div>

                  {/* Metrics row */}
                  <div className="flex items-center gap-4 text-sm">
                    <span className={scoreColor(call.evaluation_score)}>
                      Score:{" "}
                      <strong>
                        {call.evaluation_score != null
                          ? call.evaluation_score.toFixed(0)
                          : "--"}
                      </strong>
                    </span>
                    <span className="flex items-center gap-1">
                      Sentiment: {sentimentBadge(call.sentiment_score)}
                    </span>
                    {call.duration_seconds != null && (
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" />
                        {Math.floor(call.duration_seconds / 60)}m{" "}
                        {call.duration_seconds % 60}s
                      </span>
                    )}
                  </div>

                  {/* Audio player */}
                  {call.recording_url && (
                    <CallAudioPlayer
                      recordingUrl={call.recording_url}
                      callId={call.id}
                      duration={call.duration_seconds ?? undefined}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
