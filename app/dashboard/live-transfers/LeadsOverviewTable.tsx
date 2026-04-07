"use client";

import { useState, Fragment } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DateRange } from "react-day-picker";
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
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  CheckCircle2,
  Undo2,
} from "lucide-react";
import { trackEvent } from "@/lib/plg";
import { apiFetch } from "@/lib/api-client";
import { useCurrentUserOrg } from "@/hooks/useCurrentUserOrg";

const statusLabels: Record<string, string> = {
  transferred: "Transferred",
  funded: "Funded",
  declined: "Declined",
  no_answer: "No Answer",
  connected: "Connected",
};

const statusVariants: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  transferred: "outline",
  funded: "default",
  declined: "destructive",
  no_answer: "secondary",
  connected: "secondary",
};

interface Props {
  dateRange?: DateRange;
  filterDate?: string | null;
}

function rangeBounds(dateRange?: DateRange) {
  if (!dateRange) {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: start.toISOString(), to: now.toISOString() };
  }
  const from = dateRange.from?.toISOString() ?? new Date().toISOString();
  const to = dateRange.to
    ? new Date(
        dateRange.to.getFullYear(),
        dateRange.to.getMonth(),
        dateRange.to.getDate(),
        23,
        59,
        59
      ).toISOString()
    : new Date().toISOString();
  return { from, to };
}

export function LeadsOverviewTable({ dateRange, filterDate }: Props) {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { data: userOrg } = useCurrentUserOrg();
  const orgId = userOrg?.orgId;

  const { from, to } = rangeBounds(dateRange);

  const { data: transfers, isLoading } = useQuery({
    queryKey: ["live-transfers-overview", orgId, from, to],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from("live_transfers")
        .select("id, transfer_date, lead_name, lead_phone, business_name, closer_id, status, amount, closers(name)")
        .eq("org_id", orgId!)
        .gte("transfer_date", from)
        .lte("transfer_date", to)
        .order("transfer_date", { ascending: false })
        .limit(100);
      return data ?? [];
    },
  });

  // Find the expanded transfer to get its phone for call lookup
  const expandedTransfer = (transfers ?? []).find((t) => t.id === expandedId);
  const expandedPhone = expandedTransfer?.lead_phone ?? null;

  // Fetch calls associated to the expanded live_transfer via contact_phone match.
  // (call_recordings.live_transfer_id is not populated in production data, so we
  //  match by phone number which is the natural relationship.)
  const { data: expandedCalls } = useQuery({
    queryKey: ["expanded-lt-calls", orgId, expandedPhone],
    enabled: !!expandedPhone && !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from("call_recordings")
        .select("id, call_date, duration_seconds, evaluation_score, processing_status, recording_url, strengths, improvement_areas, contact_name, closers(name)")
        .eq("org_id", orgId!)
        .eq("contact_phone", expandedPhone!)
        .order("call_date", { ascending: false });
      return data ?? [];
    },
  });

  const toggleStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "transferred" | "funded" }) => {
      const res = await apiFetch("/api/live-transfers/mark-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to update");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["live-transfers-overview"] });
      queryClient.invalidateQueries({ queryKey: ["live-transfers-kpis"] });
      queryClient.invalidateQueries({ queryKey: ["live-transfers-daily"] });
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

  const filteredTransfers = filterDate
    ? (transfers ?? []).filter(
        (t) => new Date(t.transfer_date).toISOString().slice(0, 10) === filterDate
      )
    : transfers ?? [];

  return (
    <div className="rounded-xl border border-zinc-800 overflow-hidden">
      {filterDate && (
        <div className="bg-zinc-900/80 border-b border-zinc-800 px-4 py-2 text-sm text-muted-foreground">
          Showing live transfers for{" "}
          <span className="text-zinc-200 font-medium">{filterDate}</span>{" "}
          ({filteredTransfers.length} result{filteredTransfers.length !== 1 ? "s" : ""})
        </div>
      )}
      <Table>
        <TableHeader>
          <TableRow className="border-zinc-800 bg-zinc-900/50 hover:bg-zinc-900/50">
            <TableHead className="w-8" />
            <TableHead>Date</TableHead>
            <TableHead>Lead</TableHead>
            <TableHead>Business</TableHead>
            <TableHead>Closer</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredTransfers.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                {filterDate ? "No live transfers on this day." : "No live transfers in this date range."}
              </TableCell>
            </TableRow>
          ) : (
            filteredTransfers.map((row) => {
              const closer = row.closers as { name: string } | null;
              const isExpanded = expandedId === row.id;
              return (
                <Fragment key={row.id}>
                  <TableRow
                    className="border-zinc-800 cursor-pointer hover:bg-zinc-800/50"
                    onClick={() => setExpandedId(isExpanded ? null : row.id)}
                  >
                    <TableCell className="w-8 px-2">
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(row.transfer_date).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </TableCell>
                    <TableCell className="font-medium">{row.lead_name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.business_name ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {closer?.name ?? "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge variant={statusVariants[row.status] || "secondary"}>
                          {statusLabels[row.status] || row.status}
                        </Badge>
                        {row.status === "transferred" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2 text-xs text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10"
                            disabled={toggleStatusMutation.isPending}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleStatusMutation.mutate({
                                id: row.id,
                                status: "funded",
                              });
                            }}
                          >
                            <CheckCircle2 className="mr-1 h-3 w-3" />
                            Mark Funded
                          </Button>
                        )}
                        {row.status === "funded" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2 text-xs text-muted-foreground hover:text-zinc-300 hover:bg-zinc-700/50"
                            disabled={toggleStatusMutation.isPending}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleStatusMutation.mutate({
                                id: row.id,
                                status: "transferred",
                              });
                            }}
                          >
                            <Undo2 className="mr-1 h-3 w-3" />
                            Undo
                          </Button>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {row.amount != null
                        ? new Intl.NumberFormat("en-US", {
                            style: "currency",
                            currency: "USD",
                          }).format(Number(row.amount))
                        : "—"}
                    </TableCell>
                  </TableRow>

                  {isExpanded && (
                    <TableRow className="border-zinc-800 bg-zinc-900/30">
                      <TableCell colSpan={7} className="p-4">
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
