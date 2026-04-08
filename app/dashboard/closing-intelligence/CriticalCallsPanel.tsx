"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useClosers } from "@/hooks/useClosers";
import { useCurrentUserOrg } from "@/hooks/useCurrentUserOrg";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CallAudioPlayer } from "@/components/audio/CallAudioPlayer";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { CallDetailModal } from "./CallDetailModal";
import { Eye } from "lucide-react";
import type { QAAnalysisResultV2, QAPillarResult } from "@/lib/openai/types";

/**
 * Return a colored pill for a single pillar score.
 * Visual legend:
 *   🟢 exceptional  8-10
 *   🟡 developing   5-7
 *   🔴 poor         1-4
 */
function pillarDot(score: number): string {
  if (score >= 8) return "bg-emerald-500";
  if (score >= 5) return "bg-yellow-500";
  return "bg-red-500";
}

/** Typed helper: pull pillars out of the JSONB ai_analysis column. */
function extractPillars(analysis: unknown): QAPillarResult[] {
  if (
    !!analysis &&
    typeof analysis === "object" &&
    (analysis as { version?: string }).version === "v2-5-pillars-gpt4o"
  ) {
    return (analysis as QAAnalysisResultV2).pillars || [];
  }
  return [];
}

export function CriticalCallsPanel() {
  const supabase = createClient();
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);
  const { data: userOrg } = useCurrentUserOrg();
  const orgId = userOrg?.orgId;

  const { data: calls, isLoading } = useQuery({
    queryKey: ["critical-calls", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from("call_recordings")
        .select(
          "id, call_date, closer_id, evaluation_score, sentiment_score, duration_seconds, recording_url, critical_action_plan, strengths, improvement_areas, ai_analysis, contact_name, business_name"
        )
        .eq("org_id", orgId!)
        .eq("is_critical", true)
        .order("evaluation_score", { ascending: true })
        .limit(20);
      return data ?? [];
    },
  });

  const { data: closers } = useClosers();

  const getCloserName = (id: string) =>
    closers?.find((c) => c.id === id)?.name ?? "—";

  if (isLoading) {
    return (
      <Card className="bg-zinc-900/80 border-zinc-800">
        <CardHeader>
          <Skeleton className="h-5 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-48 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="bg-zinc-900/80 border-zinc-800">
        <CardHeader>
          <CardTitle className="font-heading text-lg">Critical calls</CardTitle>
          <p className="text-sm text-muted-foreground">
            Low-score calls with action plans &amp; QA criteria
          </p>
        </CardHeader>
        <CardContent>
          {(calls ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No critical calls.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-zinc-800">
                    <TableHead>Date</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Closer</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>Sentiment</TableHead>
                    <TableHead className="text-center">QA Criteria</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Audio</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(calls ?? []).map((row) => {
                    const pillars = extractPillars(row.ai_analysis);

                    return (
                      <TableRow key={row.id} className="border-zinc-800">
                        <TableCell className="text-muted-foreground whitespace-nowrap">
                          {new Date(row.call_date).toLocaleDateString("es-CL", {
                            timeZone: "America/Santiago",
                          })}
                        </TableCell>
                        <TableCell className="max-w-[120px] truncate">
                          {row.contact_name || "—"}
                        </TableCell>
                        <TableCell>{getCloserName(row.closer_id)}</TableCell>
                        <TableCell>
                          <Badge variant="destructive">
                            {row.evaluation_score != null
                              ? row.evaluation_score.toFixed(0)
                              : "—"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {row.sentiment_score != null
                            ? row.sentiment_score.toFixed(2)
                            : "—"}
                        </TableCell>
                        <TableCell>
                          {pillars.length > 0 ? (
                            <div className="flex items-center gap-1 justify-center">
                              {pillars.map((p, i) => (
                                <span
                                  key={i}
                                  title={`${p.name}: ${p.score}/10`}
                                  className={`h-2.5 w-2.5 rounded-full ${pillarDot(p.score)}`}
                                />
                              ))}
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-xs">
                              —
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          {row.duration_seconds != null
                            ? `${Math.floor(row.duration_seconds / 60)}m`
                            : "—"}
                        </TableCell>
                        <TableCell>
                          <CallAudioPlayer
                            recordingUrl={row.recording_url}
                            callId={row.id}
                            duration={row.duration_seconds ?? undefined}
                          />
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setSelectedCallId(row.id)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <CallDetailModal
        callId={selectedCallId}
        open={!!selectedCallId}
        onClose={() => setSelectedCallId(null)}
      />
    </>
  );
}
