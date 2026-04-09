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
  Volume2,
  FileText,
  RefreshCw,
  MessageSquare,
  Check,
  Loader2,
  ChevronDown,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCurrentUserOrg } from "@/hooks/useCurrentUserOrg";
import { QAReportModal } from "@/components/live-transfers/QAReportModal";
import { ReconnectButton } from "@/components/live-transfers/ReconnectButton";
import { FeedbackModal } from "@/components/live-transfers/FeedbackModal";
import { formatUSD } from "@/lib/utils/format-currency";
import { apiFetch } from "@/lib/api-client";

/**
 * Status values a user can pick from the UI dropdown. Narrower than
 * the DB enum because `disqualified` is a GHL stage (not a status)
 * and can only be set by moving the opp to the DQ stage directly
 * in GHL. See `/api/live-transfers/[id]/closing-status/route.ts`.
 */
type EditableClosingStatus = "pending_to_close" | "closed_won" | "closed_lost";

const statusLabels: Record<string, string> = {
  pending_to_close: "Pending to Close",
  closed_won: "Closed Won",
  closed_lost: "Closed Lost",
  disqualified: "Disqualified",
};

const statusVariants: Record<
  string,
  "default" | "secondary" | "outline" | "destructive"
> = {
  pending_to_close: "secondary",
  closed_won: "default",
  closed_lost: "destructive",
  disqualified: "outline",
};

interface Props {
  dateRange?: DateRange;
  filterDate?: string | null;
}

interface LiveTransferRow {
  id: string;
  status_change_date: string;
  transfer_date: string;
  lead_name: string;
  lead_phone: string | null;
  business_name: string | null;
  closer_id: string | null;
  closing_status: string | null;
  amount: number | null;
  ghl_contact_id: string | null;
  /** Closing pipeline opp id — required for the status dropdown to be enabled. */
  ghl_closing_opportunity_id: string | null;
  closers: { name: string } | null;
}

interface CallSummary {
  id: string;
  recording_url: string | null;
  evaluation_score: number | null;
  contact_phone: string | null;
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

function scoreColor(score: number | null): string {
  if (score === null) return "text-muted-foreground";
  if (score >= 70) return "text-emerald-400";
  if (score >= 40) return "text-amber-400";
  return "text-red-400";
}

export function LeadsOverviewTable({ dateRange, filterDate }: Props) {
  const supabase = createClient();
  const { data: userOrg } = useCurrentUserOrg();
  const orgId = userOrg?.orgId;

  const [audioForId, setAudioForId] = useState<string | null>(null);
  const [qaModalCallId, setQaModalCallId] = useState<string | null>(null);
  const [feedbackForId, setFeedbackForId] = useState<string | null>(null);

  const { from, to } = rangeBounds(dateRange);

  // ── Fetch live transfers in period ──
  const { data: transfers, isLoading } = useQuery<LiveTransferRow[]>({
    queryKey: ["live-transfers-overview", orgId, from, to],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from("live_transfers")
        .select(
          "id, status_change_date, transfer_date, lead_name, lead_phone, business_name, closer_id, closing_status, amount, ghl_contact_id, ghl_closing_opportunity_id, closers(name)"
        )
        .eq("org_id", orgId!)
        .gte("status_change_date", from)
        .lte("status_change_date", to)
        .order("status_change_date", { ascending: false })
        .limit(500);
      return (data ?? []) as unknown as LiveTransferRow[];
    },
  });

  // ── Mutation: change closing_status for a row ──
  //
  // POSTs to /api/live-transfers/[id]/closing-status, which:
  //   1. Validates auth + org ownership
  //   2. Looks up the row's ghl_closing_opportunity_id
  //   3. Calls GHL to update the opp status
  //   4. If GHL accepts, updates the local DB row
  //
  // On success we invalidate every cache that depends on closing_status
  // (overview table, KPI row, daily chart) so the UI refreshes without
  // a page reload.
  const queryClient = useQueryClient();

  const updateClosingStatusMutation = useMutation({
    mutationFn: async (vars: {
      id: string;
      closing_status: EditableClosingStatus;
    }) => {
      const res = await apiFetch(
        `/api/live-transfers/${vars.id}/closing-status`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ closing_status: vars.closing_status }),
        }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Failed to update status: ${res.status}`);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["live-transfers-overview"] });
      queryClient.invalidateQueries({ queryKey: ["live-transfers-kpis"] });
      queryClient.invalidateQueries({ queryKey: ["live-transfers-daily"] });
    },
  });

  // Phones to look up calls for (deduped)
  const phonesInView = (transfers ?? [])
    .map((t) => t.lead_phone)
    .filter((p): p is string => !!p);

  // ── Fetch matching calls (by phone) for the visible transfers ──
  const { data: callsByPhone } = useQuery<Map<string, CallSummary>>({
    queryKey: ["lt-calls-by-phone", orgId, phonesInView.length, from, to],
    enabled: !!orgId && phonesInView.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("call_recordings")
        .select("id, recording_url, evaluation_score, contact_phone")
        .eq("org_id", orgId!)
        .in("contact_phone", phonesInView);

      // Build map: phone → most-relevant call (the one with the highest score
      // wins; ties broken by having a recording_url)
      const byPhone = new Map<string, CallSummary>();
      for (const c of (data ?? []) as CallSummary[]) {
        if (!c.contact_phone) continue;
        const existing = byPhone.get(c.contact_phone);
        if (
          !existing ||
          (c.evaluation_score ?? -1) > (existing.evaluation_score ?? -1) ||
          (!!c.recording_url && !existing.recording_url)
        ) {
          byPhone.set(c.contact_phone, c);
        }
      }
      return byPhone;
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

  const filteredTransfers = filterDate
    ? (transfers ?? []).filter(
        (t) =>
          new Date(t.status_change_date ?? t.transfer_date)
            .toISOString()
            .slice(0, 10) === filterDate
      )
    : transfers ?? [];

  return (
    <>
      <div className="rounded-xl border border-zinc-800 overflow-hidden">
        {filterDate && (
          <div className="bg-zinc-900/80 border-b border-zinc-800 px-4 py-2 text-sm text-muted-foreground">
            Showing live transfers for{" "}
            <span className="text-zinc-200 font-medium">{filterDate}</span> (
            {filteredTransfers.length} result
            {filteredTransfers.length !== 1 ? "s" : ""})
          </div>
        )}
        <Table>
          <TableHeader>
            <TableRow className="border-zinc-800 bg-zinc-900/50 hover:bg-zinc-900/50">
              <TableHead>Date</TableHead>
              <TableHead>Lead</TableHead>
              <TableHead>Business</TableHead>
              <TableHead>Closer</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-center">Score</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredTransfers.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="text-center text-muted-foreground py-8"
                >
                  {filterDate
                    ? "No live transfers on this day."
                    : "No live transfers in this date range."}
                </TableCell>
              </TableRow>
            ) : (
              filteredTransfers.map((row) => {
                const closer = row.closers;
                const dateValue = row.status_change_date ?? row.transfer_date;
                const call = row.lead_phone
                  ? callsByPhone?.get(row.lead_phone)
                  : null;
                const hasAudio = !!call?.recording_url;
                const hasReport = !!call?.evaluation_score;
                const score = call?.evaluation_score ?? null;
                const isAudioOpen = audioForId === row.id;

                return (
                  <Fragment key={row.id}>
                    <TableRow className="border-zinc-800 hover:bg-zinc-800/30">
                      <TableCell className="text-muted-foreground">
                        {new Date(dateValue).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </TableCell>
                      <TableCell className="font-medium">
                        {row.lead_name}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {row.business_name ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {closer?.name ?? "—"}
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const currentStatus =
                            row.closing_status ?? "pending_to_close";
                          const isPending =
                            updateClosingStatusMutation.isPending &&
                            updateClosingStatusMutation.variables?.id ===
                              row.id;

                          // Disable the dropdown when:
                          //   - no closing opp has been linked yet (pre-sync)
                          //   - the row is currently disqualified (that state
                          //     can only be changed in GHL by moving stages)
                          //   - a mutation on this row is in flight
                          const disabled =
                            !row.ghl_closing_opportunity_id ||
                            currentStatus === "disqualified" ||
                            isPending;

                          const badge = (
                            <Badge
                              variant={
                                statusVariants[currentStatus] ?? "secondary"
                              }
                              className={
                                disabled
                                  ? "inline-flex items-center gap-1"
                                  : "inline-flex items-center gap-1 cursor-pointer hover:opacity-80"
                              }
                              title={
                                !row.ghl_closing_opportunity_id
                                  ? "Run a sync first to link this lead to its closing opportunity"
                                  : currentStatus === "disqualified"
                                    ? "Disqualified can only be changed in GHL directly"
                                    : undefined
                              }
                            >
                              {isPending ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : null}
                              {statusLabels[currentStatus] ??
                                "Pending to Close"}
                              {!disabled && (
                                <ChevronDown className="h-3 w-3 opacity-60" />
                              )}
                            </Badge>
                          );

                          if (disabled) return badge;

                          // Base UI's DropdownMenuTrigger renders as a
                          // native <button> (no `asChild` support like
                          // Radix), so we put the badge content directly
                          // inside it and strip default button styling.
                          return (
                            <DropdownMenu>
                              <DropdownMenuTrigger className="outline-none bg-transparent border-0 p-0 cursor-pointer">
                                {badge}
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="start">
                                {(
                                  [
                                    "pending_to_close",
                                    "closed_won",
                                    "closed_lost",
                                  ] as EditableClosingStatus[]
                                ).map((status) => (
                                  <DropdownMenuItem
                                    key={status}
                                    onClick={() =>
                                      updateClosingStatusMutation.mutate({
                                        id: row.id,
                                        closing_status: status,
                                      })
                                    }
                                    className="flex items-center justify-between gap-4"
                                  >
                                    <span>{statusLabels[status]}</span>
                                    {currentStatus === status && (
                                      <Check className="h-3.5 w-3.5 text-emerald-500" />
                                    )}
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          );
                        })()}
                      </TableCell>
                      <TableCell className="text-center">
                        {score !== null ? (
                          <span className={`font-medium ${scoreColor(score)}`}>
                            {Math.round(score)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {formatUSD(row.amount)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          {/* Audio player toggle */}
                          {hasAudio && (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="h-7 w-7"
                              title="Listen to recording"
                              onClick={() =>
                                setAudioForId(isAudioOpen ? null : row.id)
                              }
                            >
                              <Volume2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {/* QA Report */}
                          {hasReport && call && (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="h-7 w-7"
                              title="View QA report"
                              onClick={() => setQaModalCallId(call.id)}
                            >
                              <FileText className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {/* Reconnect lead */}
                          <ReconnectButton
                            liveTransferId={row.id}
                            disabled={!row.ghl_contact_id}
                          />
                          {/* Feedback */}
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="h-7 w-7"
                            title="Send feedback to Intro team"
                            onClick={() => setFeedbackForId(row.id)}
                          >
                            <MessageSquare className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>

                    {/* Inline audio player row */}
                    {isAudioOpen && hasAudio && call?.recording_url && (
                      <TableRow className="border-zinc-800 bg-zinc-900/30">
                        <TableCell colSpan={8} className="p-4">
                          <CallAudioPlayer
                            src={call.recording_url}
                            callId={call.id}
                          />
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

      {/* QA Report modal (conditionally rendered) */}
      {qaModalCallId && (
        <QAReportModal
          callId={qaModalCallId}
          open={!!qaModalCallId}
          onClose={() => setQaModalCallId(null)}
        />
      )}

      {/* Feedback modal (conditionally rendered) */}
      {feedbackForId && (
        <FeedbackModal
          liveTransferId={feedbackForId}
          open={!!feedbackForId}
          onClose={() => setFeedbackForId(null)}
        />
      )}
    </>
  );
}
