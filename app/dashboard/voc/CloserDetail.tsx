"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { StatCard } from "@/components/shared/StatCard";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { CallAudioPlayer } from "@/components/audio/CallAudioPlayer";

interface CloserDetailProps {
  closerId: string;
  initialCloser: { id: string; name: string; email?: string; avatar_url?: string; active: boolean };
}

export function CloserDetail({ closerId, initialCloser }: CloserDetailProps) {
  const supabase = createClient();
  const { data: calls } = useQuery({
    queryKey: ["call-recordings", closerId],
    queryFn: async () => {
      const { data } = await supabase
        .from("call_recordings")
        .select("*")
        .eq("closer_id", closerId)
        .order("call_date", { ascending: false });
      return data ?? [];
    },
  });

  const stats = {
    totalCalls: calls?.length ?? 0,
    avgScore:
      calls?.length && calls.some((c) => c.evaluation_score != null)
        ? calls.reduce((a, c) => a + Number(c.evaluation_score ?? 0), 0) / calls.length
        : 0,
    avgSentiment:
      calls?.length && calls.some((c) => c.sentiment_score != null)
        ? calls.reduce((a, c) => a + Number(c.sentiment_score ?? 0), 0) / calls.length
        : 0,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Avatar className="h-14 w-14">
          <AvatarImage src={initialCloser.avatar_url} />
          <AvatarFallback className="bg-muted text-lg">
            {initialCloser.name.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div>
          <h1 className="font-heading text-2xl font-semibold">{initialCloser.name}</h1>
          <p className="text-sm text-muted-foreground">
            {initialCloser.active ? "Active" : "Inactive"}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard title="Total calls" value={stats.totalCalls} />
        <StatCard
          title="Avg evaluation score"
          value={stats.avgScore ? stats.avgScore.toFixed(1) : "—"}
        />
        <StatCard
          title="Avg sentiment"
          value={stats.avgSentiment ? stats.avgSentiment.toFixed(2) : "—"}
        />
      </div>
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="font-heading">Call history</CardTitle>
        </CardHeader>
        <CardContent>
          {(calls ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No calls yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border">
                  <TableHead>Date</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Sentiment</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Audio</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {calls!.map((row) => (
                  <TableRow key={row.id} className="border-border">
                    <TableCell className="text-muted-foreground">
                      {new Date(row.call_date).toLocaleDateString("es-CL", {
                        timeZone: "America/Santiago",
                      })}
                    </TableCell>
                    <TableCell>
                      <Badge variant={row.evaluation_score != null && row.evaluation_score < 40 ? "destructive" : "secondary"}>
                        {row.evaluation_score != null ? row.evaluation_score.toFixed(0) : "—"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {row.sentiment_score != null ? row.sentiment_score.toFixed(2) : "—"}
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
    </div>
  );
}
