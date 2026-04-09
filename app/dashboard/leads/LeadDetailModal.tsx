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
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CallAudioPlayer } from "@/components/audio/CallAudioPlayer";
import { ExternalLink, Phone, Mail, Building2, Calendar } from "lucide-react";
import { trackEvent } from "@/lib/plg";
import { useEffect } from "react";
import { useCurrentUserOrg } from "@/hooks/useCurrentUserOrg";

interface LeadDetailModalProps {
  leadId: string | null;
  onClose: () => void;
}

export function LeadDetailModal({ leadId, onClose }: LeadDetailModalProps) {
  useEffect(() => {
    if (leadId) {
      trackEvent("lead_detail_opened", { lead_id: leadId });
    }
  }, [leadId]);

  const supabase = createClient();
  const { data: userOrg } = useCurrentUserOrg();
  const orgId = userOrg?.orgId;

  const { data: lead, isLoading: leadLoading } = useQuery({
    queryKey: ["lead-detail", orgId, leadId],
    enabled: !!leadId && !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("*, closers(name, avatar_url)")
        .eq("org_id", orgId!)
        .eq("id", leadId!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: calls, isLoading: callsLoading } = useQuery({
    queryKey: ["lead-calls", orgId, leadId],
    enabled: !!leadId && !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("call_recordings")
        .select("*, closers(name)")
        .eq("org_id", orgId!)
        .eq("lead_id", leadId!)
        .order("call_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const statusLabels: Record<string, string> = {
    in_sequence: "In Sequence",
    transferred: "Transferred",
    closed_won: "Closed Won",
  };

  const scoreColor = (score: number | null) => {
    if (!score) return "text-muted-foreground";
    if (score >= 70) return "text-emerald-400";
    if (score >= 40) return "text-amber-400";
    return "text-red-400";
  };

  return (
    <Dialog open={!!leadId} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto bg-zinc-950 border-zinc-800">
        {leadLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : lead ? (
          <>
            <DialogHeader>
              <DialogTitle className="font-heading text-xl">
                {lead.name}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              {/* Lead Info */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                {lead.business_name && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Building2 className="h-4 w-4" />
                    {lead.business_name}
                  </div>
                )}
                {lead.phone && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Phone className="h-4 w-4" />
                    {lead.phone}
                  </div>
                )}
                {lead.email && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Mail className="h-4 w-4" />
                    {lead.email}
                  </div>
                )}
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  {new Date(lead.created_at).toLocaleDateString("en-US", {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </div>
              </div>

              <div className="flex gap-2">
                <Badge variant={lead.status === "closed_won" ? "default" : "secondary"}>
                  {statusLabels[lead.status] || lead.status}
                </Badge>
                <Badge variant="outline">
                  {lead.source === "client_upload"
                    ? "Your Leads"
                    : "Intro"}
                </Badge>
                {lead.amount && (
                  <Badge variant="outline">
                    {new Intl.NumberFormat("en-US", {
                      style: "currency",
                      currency: "USD",
                    }).format(lead.amount)}
                  </Badge>
                )}
              </div>

              {/* Calls Section */}
              <div>
                <h3 className="font-heading font-medium text-sm mb-3">
                  Call History ({calls?.length || 0})
                </h3>
                {callsLoading ? (
                  <Skeleton className="h-24 w-full" />
                ) : calls && calls.length > 0 ? (
                  <div className="space-y-3">
                    {calls.map((call) => {
                      const closer = call.closers as { name: string } | null;
                      return (
                        <div
                          key={call.id}
                          className="rounded-lg border border-zinc-800 p-3 space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-sm">
                              <span className="text-muted-foreground">
                                {new Date(call.call_date).toLocaleDateString(
                                  "en-US",
                                  { month: "short", day: "numeric" }
                                )}
                              </span>
                              {closer && (
                                <span className="text-muted-foreground">
                                  {closer.name}
                                </span>
                              )}
                              {call.duration_seconds && (
                                <span className="text-muted-foreground">
                                  {Math.floor(call.duration_seconds / 60)}m{" "}
                                  {call.duration_seconds % 60}s
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              {call.evaluation_score !== null && (
                                <span
                                  className={`text-sm font-medium ${scoreColor(call.evaluation_score)}`}
                                >
                                  {call.evaluation_score}/100
                                </span>
                              )}
                              {call.processing_status === "completed" && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    trackEvent("qa_report_viewed", { call_id: call.id });
                                    window.open(
                                      `/api/reports/qa/${call.id}`,
                                      "_blank"
                                    );
                                  }}
                                >
                                  <ExternalLink className="h-3.5 w-3.5 mr-1" />
                                  QA Report
                                </Button>
                              )}
                            </div>
                          </div>

                          {call.recording_url && (
                            <CallAudioPlayer recordingUrl={call.recording_url} callId={call.id} />
                          )}

                          {call.strengths && call.strengths.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {call.strengths.map((s: string) => (
                                <Badge
                                  key={s}
                                  variant="outline"
                                  className="text-xs text-emerald-400 border-emerald-800"
                                >
                                  {s}
                                </Badge>
                              ))}
                            </div>
                          )}

                          {call.improvement_areas &&
                            call.improvement_areas.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {call.improvement_areas.map((a: string) => (
                                  <Badge
                                    key={a}
                                    variant="outline"
                                    className="text-xs text-amber-400 border-amber-800"
                                  >
                                    {a}
                                  </Badge>
                                ))}
                              </div>
                            )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No calls recorded for this lead yet.
                  </p>
                )}
              </div>
            </div>
          </>
        ) : (
          <p className="text-muted-foreground">Lead not found.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
