"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
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
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  User,
  Phone,
  Building,
  Calendar,
  Clock,
} from "lucide-react";

interface CallDetailModalProps {
  callId: string | null;
  open: boolean;
  onClose: () => void;
}

const scoreBadge = (score: string) => {
  const s = score?.toLowerCase() || "";
  if (s.includes("good"))
    return (
      <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30">
        <CheckCircle2 className="mr-1 h-3 w-3" /> Good
      </Badge>
    );
  if (s.includes("partial"))
    return (
      <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/30">
        <AlertTriangle className="mr-1 h-3 w-3" /> Partial
      </Badge>
    );
  return (
    <Badge className="bg-red-500/10 text-red-500 border-red-500/30">
      <XCircle className="mr-1 h-3 w-3" /> Missed
    </Badge>
  );
};

const overallBadge = (score: number | null) => {
  if (score == null) return null;
  if (score >= 70)
    return (
      <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30 text-lg px-3 py-1">
        {score.toFixed(0)}
      </Badge>
    );
  if (score >= 40)
    return (
      <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/30 text-lg px-3 py-1">
        {score.toFixed(0)}
      </Badge>
    );
  return (
    <Badge className="bg-red-500/10 text-red-500 border-red-500/30 text-lg px-3 py-1">
      {score.toFixed(0)}
    </Badge>
  );
};

export function CallDetailModal({ callId, open, onClose }: CallDetailModalProps) {
  const supabase = createClient();

  const { data: call, isLoading } = useQuery({
    queryKey: ["call-detail", callId],
    queryFn: async () => {
      if (!callId) return null;
      const { data } = await supabase
        .from("call_recordings")
        .select(
          "*, closers(name)"
        )
        .eq("id", callId)
        .single();
      return data;
    },
    enabled: !!callId && open,
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-zinc-900 border-zinc-800 max-w-3xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">
            Call Analysis
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-4 p-4">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : !call ? (
          <p className="text-muted-foreground p-4">Call not found.</p>
        ) : (
          <ScrollArea className="max-h-[75vh] pr-4">
            <div className="space-y-6 p-1">
              {/* Header info */}
              <div className="flex flex-wrap items-center gap-4">
                {overallBadge(call.evaluation_score)}
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm text-zinc-300">
                    <User className="h-4 w-4" />
                    {call.contact_name || "Unknown Contact"}
                  </div>
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                    {call.contact_phone && (
                      <span className="flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {call.contact_phone}
                      </span>
                    )}
                    {call.business_name && (
                      <span className="flex items-center gap-1">
                        <Building className="h-3 w-3" />
                        {call.business_name}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {new Date(call.call_date).toLocaleDateString("en-US")}
                    </span>
                    {call.duration_seconds != null && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {Math.floor(call.duration_seconds / 60)}m{" "}
                        {call.duration_seconds % 60}s
                      </span>
                    )}
                  </div>
                </div>
                <div className="ml-auto text-sm text-zinc-400">
                  Closer:{" "}
                  <span className="text-zinc-200">
                    {(call.closers as { name?: string })?.name || "—"}
                  </span>
                </div>
              </div>

              {/* Sentiment */}
              {call.sentiment_score != null && (
                <div className="flex items-center gap-3">
                  <span className="text-sm text-zinc-400">Sentiment:</span>
                  <Badge
                    variant="outline"
                    className={
                      call.sentiment_score > 0
                        ? "border-emerald-500/30 text-emerald-400"
                        : call.sentiment_score < 0
                        ? "border-red-500/30 text-red-400"
                        : "border-zinc-500/30 text-zinc-400"
                    }
                  >
                    {call.sentiment_score > 0 ? "+" : ""}
                    {call.sentiment_score.toFixed(2)}
                  </Badge>
                </div>
              )}

              {/* Audio player */}
              {call.recording_url && (
                <CallAudioPlayer
                  recordingUrl={call.recording_url}
                  callId={call.id}
                  duration={call.duration_seconds ?? undefined}
                />
              )}

              {/* QA Criteria */}
              {call.criteria_scores && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-zinc-200">
                    QA Criteria (5-point evaluation)
                  </h3>
                  <div className="grid gap-2">
                    {Object.entries(
                      call.criteria_scores as Record<string, string>
                    ).map(([criterion, score]) => (
                      <div
                        key={criterion}
                        className="flex items-center justify-between rounded-lg bg-zinc-800/50 border border-zinc-700/50 p-3"
                      >
                        <span className="text-sm text-zinc-300">
                          {criterion}
                        </span>
                        {scoreBadge(score)}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Strengths & Improvements */}
              <div className="grid gap-4 md:grid-cols-2">
                {call.strengths && (call.strengths as string[]).length > 0 && (
                  <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/20 p-4 space-y-2">
                    <h4 className="text-sm font-semibold text-emerald-400">
                      Strengths
                    </h4>
                    <ul className="space-y-1">
                      {(call.strengths as string[]).map((s, i) => (
                        <li key={i} className="text-sm text-zinc-300">
                          • {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {call.improvement_areas &&
                  (call.improvement_areas as string[]).length > 0 && (
                    <div className="rounded-lg bg-yellow-500/5 border border-yellow-500/20 p-4 space-y-2">
                      <h4 className="text-sm font-semibold text-yellow-400">
                        Areas to Improve
                      </h4>
                      <ul className="space-y-1">
                        {(call.improvement_areas as string[]).map((s, i) => (
                          <li key={i} className="text-sm text-zinc-300">
                            • {s}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
              </div>

              {/* Action Plan */}
              {call.critical_action_plan && (
                <div className="rounded-lg bg-red-500/5 border border-red-500/20 p-4 space-y-2">
                  <h4 className="text-sm font-semibold text-red-400">
                    Action Plan
                  </h4>
                  <p className="text-sm text-zinc-300 whitespace-pre-line">
                    {call.critical_action_plan}
                  </p>
                </div>
              )}

              {/* Transcript */}
              {call.transcript && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-zinc-200">
                    Transcript
                  </h3>
                  <div className="rounded-lg bg-zinc-800/50 border border-zinc-700/50 p-4 max-h-64 overflow-y-auto">
                    <p className="text-sm text-zinc-300 whitespace-pre-line leading-relaxed">
                      {call.transcript}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
