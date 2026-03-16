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
import { CheckCircle2 } from "lucide-react";

export function LiveTransfersTable() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  const { data: transfers, isLoading } = useQuery({
    queryKey: ["live-transfers"],
    queryFn: async () => {
      const { data } = await supabase
        .from("live_transfers")
        .select("id, transfer_date, lead_name, business_name, closer_id, status, amount")
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

  const markFundedMutation = useMutation({
    mutationFn: async (transferId: string) => {
      const res = await fetch("/api/live-transfers/mark-funded", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: transferId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to update");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["live-transfers"] });
      queryClient.invalidateQueries({ queryKey: ["overview-kpis"] });
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

  return (
    <div className="rounded-xl border border-zinc-800 overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="border-zinc-800 bg-zinc-900/50">
            <TableHead>Date</TableHead>
            <TableHead>Lead</TableHead>
            <TableHead>Business</TableHead>
            <TableHead>Closer</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(transfers ?? []).length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                No live transfers yet this month.
              </TableCell>
            </TableRow>
          ) : (
            (transfers ?? []).map((row) => (
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
                    <Badge variant="default">funded</Badge>
                  ) : row.status === "declined" ? (
                    <Badge variant="destructive">declined</Badge>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{row.status}</Badge>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-xs text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10"
                        disabled={markFundedMutation.isPending}
                        onClick={() => markFundedMutation.mutate(row.id)}
                      >
                        <CheckCircle2 className="mr-1 h-3 w-3" />
                        Mark Funded
                      </Button>
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {row.amount != null
                    ? new Intl.NumberFormat("es-CL", {
                        style: "currency",
                        currency: "USD",
                      }).format(Number(row.amount))
                    : "—"}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
