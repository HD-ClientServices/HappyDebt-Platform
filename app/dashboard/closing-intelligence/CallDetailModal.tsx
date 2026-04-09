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
  User,
  Phone,
  Building,
  Calendar,
  Clock,
  AlertTriangle,
  Flag,
} from "lucide-react";
import { useCurrentUserOrg } from "@/hooks/useCurrentUserOrg";
import type {
  QAAnalysisResultV2,
  QAPillarResult,
  PillarLevel,
} from "@/lib/openai/types";

interface CallDetailModalProps {
  callId: string | null;
  open: boolean;
  onClose: () => void;
}

/** Detect if a stored ai_analysis object is the V2 5-pillar format. */
function isV2Analysis(x: unknown): x is QAAnalysisResultV2 {
  return (
    !!x &&
    typeof x === "object" &&
    (x as { version?: string }).version === "v2-5-pillars-gpt4o"
  );
}

/** Pillar-level color scheme (matches the report HTML). */
function levelClasses(level: PillarLevel): {
  border: string;
  bg: string;
  text: string;
} {
  switch (level) {
    case "exceptional":
      return {
        border: "border-emerald-500/30",
        bg: "bg-emerald-500/10",
        text: "text-emerald-400",
      };
    case "developing":
      return {
        border: "border-yellow-500/30",
        bg: "bg-yellow-500/10",
        text: "text-yellow-400",
      };
    case "poor":
      return {
        border: "border-red-500/30",
        bg: "bg-red-500/10",
        text: "text-red-400",
      };
  }
}

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
  const { data: userOrg } = useCurrentUserOrg();
  const orgId = userOrg?.orgId;

  const { data: call, isLoading } = useQuery({
    queryKey: ["call-detail", orgId, callId],
    queryFn: async () => {
      if (!callId) return null;
      const { data } = await supabase
        .from("call_recordings")
        .select("*, closers(name)")
        .eq("org_id", orgId!)
        .eq("id", callId)
        .single();
      return data;
    },
    enabled: !!callId && open && !!orgId,
  });

  const analysis = call?.ai_analysis;
  const v2 = isV2Analysis(analysis) ? analysis : null;

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

              {/* V2: 5-pillar scorecard */}
              {v2 && v2.pillars.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-baseline justify-between">
                    <h3 className="text-sm font-semibold text-zinc-200">
                      5-Pillar Scorecard
                    </h3>
                    <span className="text-xs text-muted-foreground">
                      Total {v2.total_score}/50 · Avg {v2.avg_score.toFixed(1)}
                      /10
                    </span>
                  </div>
                  <div className="grid gap-2">
                    {v2.pillars.map((p) => {
                      const cs = levelClasses(p.level);
                      return (
                        <div
                          key={p.name}
                          className={`rounded-lg border ${cs.border} ${cs.bg} p-3`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-2 min-w-0">
                              <span className="text-base leading-none mt-0.5">
                                {p.emoji}
                              </span>
                              <div className="min-w-0">
                                <div className="text-sm font-semibold text-zinc-100 truncate">
                                  {p.name}
                                </div>
                                {p.impact && (
                                  <div className="text-xs text-zinc-400 mt-0.5">
                                    {p.impact}
                                  </div>
                                )}
                              </div>
                            </div>
                            <div
                              className={`text-sm font-bold ${cs.text} shrink-0`}
                            >
                              {p.score}/10
                            </div>
                          </div>
                          {p.prescribed_fix && (
                            <PillarDetail pillar={p} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* V2: The Critical Moment */}
              {v2?.critical_moment && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 space-y-2">
                  <h4 className="text-sm font-semibold text-amber-400 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    The Critical Moment
                  </h4>
                  <p className="text-sm text-zinc-300 whitespace-pre-line">
                    {v2.critical_moment}
                  </p>
                </div>
              )}

              {/* V2: Pattern Flags */}
              {v2 && v2.pattern_flags.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-red-400 flex items-center gap-2">
                    <Flag className="h-4 w-4" />
                    Closing Intelligence — Pattern Flags
                  </h4>
                  <div className="space-y-1.5">
                    {v2.pattern_flags.map((flag, i) => (
                      <div
                        key={i}
                        className="rounded-md border border-red-500/25 bg-red-500/5 px-3 py-2 text-sm text-red-300"
                      >
                        ⚠ {flag}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Strengths & Improvements (unchanged, still populated by pipeline) */}
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

              {/* V2: Priority Action Items */}
              {v2 && v2.action_items.length > 0 && (
                <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/20 p-4 space-y-2">
                  <h4 className="text-sm font-semibold text-emerald-400">
                    Priority Action Items
                  </h4>
                  <ol className="space-y-2 list-decimal list-inside">
                    {v2.action_items.map((item, i) => (
                      <li key={i} className="text-sm text-zinc-300">
                        {item}
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {/* Legacy: Action Plan (pipeline-level, always populated for critical) */}
              {!v2?.action_items?.length && call.critical_action_plan && (
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

/**
 * Collapsible-ish detail block for a single pillar. Shows the client
 * signal, rep response, diagnosis, and prescribed fix if they were
 * extracted by the parser.
 */
function PillarDetail({ pillar }: { pillar: QAPillarResult }) {
  return (
    <div className="mt-3 space-y-2 border-t border-zinc-800 pt-3">
      {pillar.client_signal && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold mb-0.5">
            Client Signal
          </div>
          <div className="text-xs italic text-zinc-400 border-l-2 border-zinc-700 pl-2">
            {pillar.client_signal}
          </div>
        </div>
      )}
      {pillar.rep_response && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold mb-0.5">
            Rep Response
          </div>
          <div className="text-xs italic text-zinc-400 border-l-2 border-zinc-700 pl-2">
            {pillar.rep_response}
          </div>
        </div>
      )}
      {pillar.diagnosis && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold mb-0.5">
            Diagnosis
          </div>
          <div className="text-xs text-zinc-300">{pillar.diagnosis}</div>
        </div>
      )}
      {pillar.prescribed_fix && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold mb-0.5">
            Prescribed Fix — Script
          </div>
          <div className="text-xs text-emerald-200 bg-emerald-500/10 border border-emerald-500/25 rounded px-2 py-1.5">
            {pillar.prescribed_fix}
          </div>
        </div>
      )}
    </div>
  );
}
