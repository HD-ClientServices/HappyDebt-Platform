"use client";

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

export function CriticalCallsPanel() {
  const supabase = createClient();
  const { data: calls, isLoading } = useQuery({
    queryKey: ["critical-calls"],
    queryFn: async () => {
      const { data } = await supabase
        .from("call_recordings")
        .select("id, call_date, closer_id, evaluation_score, sentiment_score, duration_seconds, recording_url, critical_action_plan, strengths, improvement_areas")
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
    <Card className="bg-zinc-900/80 border-zinc-800">
      <CardHeader>
        <CardTitle className="font-heading text-lg">Critical calls</CardTitle>
        <p className="text-sm text-muted-foreground">
          Low-score calls with action plans
        </p>
      </CardHeader>
      <CardContent>
        {(calls ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No critical calls.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-zinc-800">
                <TableHead>Date</TableHead>
                <TableHead>Closer</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Sentiment</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Audio</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(calls ?? []).map((row) => (
                <TableRow key={row.id} className="border-zinc-800">
                  <TableCell className="text-muted-foreground">
                    {new Date(row.call_date).toLocaleDateString("es-CL", {
                      timeZone: "America/Santiago",
                    })}
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
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
