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
import { Skeleton } from "@/components/ui/skeleton";

export function LiveTransfersTable() {
  const supabase = createClient();
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

  const getCloserName = (id: string | null) =>
    closers?.find((c) => c.id === id)?.name ?? "—";

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border overflow-hidden">
        <Skeleton className="h-10 w-full" />
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-12 w-full rounded-none" />
        ))}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="border-border bg-card/50">
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
              <TableRow key={row.id} className="border-border">
                <TableCell className="text-muted-foreground">
                  {new Date(row.transfer_date).toLocaleDateString("es-CL", {
                    timeZone: "America/Santiago",
                  })}
                </TableCell>
                <TableCell>{row.lead_name}</TableCell>
                <TableCell>{row.business_name ?? "—"}</TableCell>
                <TableCell>{getCloserName(row.closer_id)}</TableCell>
                <TableCell>
                  <Badge
                    variant={
                      row.status === "funded"
                        ? "default"
                        : row.status === "declined"
                          ? "destructive"
                          : "secondary"
                    }
                  >
                    {row.status}
                  </Badge>
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
