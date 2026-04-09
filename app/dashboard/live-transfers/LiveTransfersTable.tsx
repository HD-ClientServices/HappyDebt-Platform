"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useClosers } from "@/hooks/useClosers";
import { useCurrentUserOrg } from "@/hooks/useCurrentUserOrg";
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
import { formatUSD } from "@/lib/utils/format-currency";

export function LiveTransfersTable() {
  const supabase = createClient();
  const { data: userOrg } = useCurrentUserOrg();
  const orgId = userOrg?.orgId;

  const { data: transfers, isLoading } = useQuery({
    queryKey: ["live-transfers", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const { data } = await supabase
        .from("live_transfers")
        .select("id, transfer_date, lead_name, business_name, closer_id, status, amount")
        .eq("org_id", orgId!)
        .gte("transfer_date", startOfMonth)
        .order("transfer_date", { ascending: false })
        .limit(100);
      return data;
    },
  });

  const { data: closers } = useClosers();

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
                  {formatUSD(row.amount)}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
