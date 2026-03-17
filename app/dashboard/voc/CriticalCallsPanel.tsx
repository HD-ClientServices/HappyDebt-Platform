"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
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
import { Eye, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";

const miniScore = (score: string | undefined) => {
  if (!score) return null;
  const s = score.toLowerCase();
  if (s.includes("good"))
    return <CheckCircle2 className="h-3.5 w-3.5 text-success" />;
  if (s.includes("partial"))
    return <AlertTriangle className="h-3.5 w-3.5 text-yellow-500" />;
  return <XCircle className="h-3.5 w-3.5 text-red-500" />;
};

export function CriticalCallsPanel() {
  const supabase = createClient();
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);

  const { data: calls, isLoading } = useQuery({
    queryKey: ["critical-calls"],
    queryFn: async () => {
      const { data } = await supabase
        .from("call_recordings")
        .select(
          "id, call_date, closer_id, evaluation_score, sentiment_score, duration_seconds, recording_url, critical_action_plan, strengths, improvement_areas, criteria_scores, contact_name, business_name"
        )
        .eq("is_critical", true)
        .order("evaluation_score", { ascending: true })
        .limit(20);
      return data ?? [];
    },
  });

  const { data: closers } = useQuery({
    queryKey: ["closers"],
    queryFn: async () => {
      const { data } = await supabase.from("closers").select("id, name");
      return data ?? [];
    },
  });

  const getCloserName = (id: string) =>
    closers?.find((c) => c.id === id)?.name ?? "—";

  if (isLoading) {
    return (
      <Card className="bg-card border-border">
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
      <Card className="bg-card border-border">
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
                  <TableRow className="border-border">
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
                    const criteria = row.criteria_scores as Record<
                      string,
                      string
                    > | null;
                    const criteriaValues = criteria
                      ? Object.values(criteria)
                      : [];

                    return (
                      <TableRow key={row.id} className="border-border">
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
                          {criteriaValues.length > 0 ? (
                            <div className="flex items-center gap-1 justify-center">
                              {criteriaValues.map((s, i) => (
                                <span key={i} title={`Criterion ${i + 1}: ${s}`}>
                                  {miniScore(s)}
                                </span>
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
