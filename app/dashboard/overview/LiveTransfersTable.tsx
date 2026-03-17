"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
import { CheckCircle2, Undo2 } from "lucide-react";
import { DateRange } from "react-day-picker";

interface Props {
  dateRange: DateRange;
  filterDate?: string | null;
}

export function LiveTransfersTable({ dateRange, filterDate }: Props) {
  const supabase = createClient();
  const queryClient = useQueryClient();

  const from = dateRange.from?.toISOString() ?? new Date().toISOString();
  const to = dateRange.to
    ? new Date(dateRange.to.getFullYear(), dateRange.to.getMonth(), dateRange.to.getDate(), 23, 59, 59).toISOString()
    : new Date().toISOString();

  const { data: transfers, isLoading } = useQuery({
    queryKey: ["live-transfers", from, to],
    queryFn: async () => {
      const { data } = await supabase
        .from("live_transfers")
        .select("id, transfer_date, lead_name, business_name, closer_id, status")
        .gte("transfer_date", from)
        .lte("transfer_date", to)
        .order("transfer_date", { ascending: false })
        .limit(100);
      return data;
    },
  });

  const { data: closers } = useQuery({
    queryKey: ["closers"],
    queryFn: async () => {
      const { data } = await supabase.from("closers").select("id, name");
      return data ?? [];
    },
  });

  const filteredTransfers = filterDate
    ? (transfers ?? []).filter(
        (t) => new Date(t.transfer_date).toISOString().slice(0, 10) === filterDate
      )
    : transfers;

  const toggleStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await fetch("/api/live-transfers/mark-funded", {
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
      queryClient.invalidateQueries({ queryKey: ["live-transfers", from, to] });
      queryClient.invalidateQueries({ queryKey: ["overview-kpis"] });
      queryClient.invalidateQueries({ queryKey: ["live-transfers-daily"] });
    },
  });

  const getCloserName = (id: string | null) =>
    closers?.find((c) => c.id === id)?.name ?? "—";

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

  const rows = filteredTransfers ?? [];

  return (
    <div className="rounded-xl border border-zinc-800 overflow-hidden">
      {filterDate && (
        <div className="bg-zinc-900/80 border-b border-zinc-800 px-4 py-2 text-sm text-muted-foreground">
          Showing transfers for <span className="text-zinc-200 font-medium">{filterDate}</span>
          {" "}({rows.length} result{rows.length !== 1 ? "s" : ""})
        </div>
      )}
      <Table className="table-fixed">
        <colgroup>
          <col className="w-[12%]" />
          <col className="w-[22%]" />
          <col className="w-[28%]" />
          <col className="w-[13%]" />
          <col className="w-[25%]" />
        </colgroup>
        <TableHeader>
          <TableRow className="border-zinc-800 bg-zinc-900/50">
            <TableHead>Date</TableHead>
            <TableHead>Lead</TableHead>
            <TableHead>Business</TableHead>
            <TableHead>Closer</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                {filterDate ? "No transfers on this day." : "No live transfers yet this month."}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow key={row.id} className="border-zinc-800">
                <TableCell className="text-muted-foreground">
                  {new Date(row.transfer_date).toLocaleDateString("es-CL", {
                    timeZone: "America/Santiago",
                  })}
                </TableCell>
                <TableCell>{row.lead_name}</TableCell>
                <TableCell>{row.business_name ?? "—"}</TableCell>
                <TableCell>{getCloserName(row.closer_id)}</TableCell>
                <TableCell>
                  {row.status === "funded" ? (
                    <div className="flex items-center gap-2">
                      <Badge variant="default" className="w-20 justify-center">funded</Badge>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-xs text-muted-foreground hover:text-zinc-300 hover:bg-zinc-700/50"
                        disabled={toggleStatusMutation.isPending}
                        onClick={() => toggleStatusMutation.mutate({ id: row.id, status: "transferred" })}
                      >
                        <Undo2 className="mr-1 h-3 w-3" />
                        Undo
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="w-20 justify-center">transferred</Badge>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-xs text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10"
                        disabled={toggleStatusMutation.isPending}
                        onClick={() => toggleStatusMutation.mutate({ id: row.id, status: "funded" })}
                      >
                        <CheckCircle2 className="mr-1 h-3 w-3" />
                        Mark Funded
                      </Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
