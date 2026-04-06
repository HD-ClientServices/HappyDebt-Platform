"use client";

import { useState, Fragment } from "react";
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
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CallAudioPlayer } from "@/components/audio/CallAudioPlayer";
import { ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import { trackEvent } from "@/lib/plg";

const statusLabels: Record<string, string> = {
  in_sequence: "In Sequence",
  transferred: "Transferred",
  closed_won: "Closed Won",
};

const statusVariants: Record<string, "default" | "secondary" | "outline"> = {
  in_sequence: "secondary",
  transferred: "outline",
  closed_won: "default",
};

export function LeadsOverviewTable() {
  const supabase = createClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: leads, isLoading } = useQuery({
    queryKey: ["overview-leads"],
    queryFn: async () => {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const { data } = await supabase
        .from("leads")
        .select("id, name, business_name, closer_id, status, amount, source, created_at, closers(name)")
        .gte("created_at", startOfMonth)
        .order("created_at", { ascending: false })
        .limit(100);
      return data ?? [];
    },
  });

  // Fetch calls for expanded lead
  const { data: expandedCalls } = useQuery({
    queryKey: ["expanded-lead-calls", expandedId],
    enabled: !!expandedId,
    queryFn: async () => {
      const { data } = await supabase
        .from("call_recordings")
        .select("id, call_date, duration_seconds, evaluation_score, processing_status, recording_url, strengths, improvement_areas, closers(name)")
        .eq("lead_id", expandedId!)
        .order("call_date", { ascending: false });
      return data ?? [];
    },
  });

  if (isLoading) {
    return (
      <div className="rounded-xl border border-zinc-800 overflow-hidden">
        <Skeleton className="h-10 w-full" />
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-12 w-full rounded-none" />
        ))}
      </div>
    );
  }

  const scoreColor = (score: number | null) => {
    if (score === null) return "text-muted-foreground";
    if (score >= 70) return "text-emerald-400";
    if (score >= 40) return "text-amber-400";
    return "text-red-400";
  };

  return (
    <div className="rounded-xl border border-zinc-800 overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="border-zinc-800 bg-zinc-900/50 hover:bg-zinc-900/50">
            <TableHead className="w-8" />
            <TableHead>Date</TableHead>
            <TableHead>Lead</TableHead>
            <TableHead>Business</TableHead>
            <TableHead>Source</TableHead>
            <TableHead>Closer</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(leads ?? []).length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                No leads this month. Upload leads or sync from GHL.
              </TableCell>
            </TableRow>
          ) : (
            (leads ?? []).map((lead) => {
              const closer = lead.closers as { name: string } | null;
              const isExpanded = expandedId === lead.id;
              return (
                <Fragment key={lead.id}>
                  <TableRow
                    className="border-zinc-800 cursor-pointer hover:bg-zinc-800/50"
                    onClick={() => setExpandedId(isExpanded ? null : lead.id)}
                  >
                    <TableCell className="w-8 px-2">
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(lead.created_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </TableCell>
                    <TableCell className="font-medium">{lead.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {lead.business_name ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {lead.source === "client_upload"
                          ? "Your Leads"
                          : lead.source === "happydebt"
                            ? "HappyDebt"
                            : "GHL"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {closer?.name ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariants[lead.status] || "secondary"}>
                        {statusLabels[lead.status] || lead.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {lead.amount != null
                        ? new Intl.NumberFormat("en-US", {
                            style: "currency",
                            currency: "USD",
                          }).format(Number(lead.amount))
                        : "—"}
                    </TableCell>
                  </TableRow>

                  {isExpanded && (
                    <TableRow className="border-zinc-800 bg-zinc-900/30">
                      <TableCell colSpan={8} className="p-4">
                        <div className="space-y-3">
                          <h4 className="text-sm font-medium">
                            Calls ({expandedCalls?.length ?? 0})
                          </h4>
                          {!expandedCalls || expandedCalls.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                              No calls recorded for this lead.
                            </p>
                          ) : (
                            expandedCalls.map((call) => (
                              <div
                                key={call.id}
                                className="rounded-lg border border-zinc-800 p-3 space-y-2"
                              >
                                <div className="flex items-center justify-between text-sm">
                                  <div className="flex items-center gap-3">
                                    <span className="text-muted-foreground">
                                      {new Date(call.call_date).toLocaleDateString("en-US", {
                                        month: "short",
                                        day: "numeric",
                                      })}
                                    </span>
                                    {call.duration_seconds && (
                                      <span className="text-muted-foreground">
                                        {Math.floor(call.duration_seconds / 60)}m {call.duration_seconds % 60}s
                                      </span>
                                    )}
                                    {(call.closers as { name: string } | null)?.name && (
                                      <span className="text-muted-foreground">
                                        {(call.closers as { name: string }).name}
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {call.evaluation_score !== null && (
                                      <span className={`font-medium ${scoreColor(call.evaluation_score)}`}>
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
                                          window.open(`/api/reports/qa/${call.id}`, "_blank");
                                        }}
                                      >
                                        <ExternalLink className="h-3.5 w-3.5 mr-1" />
                                        QA Report
                                      </Button>
                                    )}
                                  </div>
                                </div>
                                {call.recording_url && (
                                  <CallAudioPlayer src={call.recording_url} />
                                )}
                              </div>
                            ))
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
