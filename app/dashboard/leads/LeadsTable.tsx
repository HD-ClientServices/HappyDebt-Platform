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
import { Eye } from "lucide-react";
import type { LeadStatus, LeadSource } from "@/types/database";

interface LeadsTableProps {
  statusFilter?: LeadStatus;
  search: string;
  onSelectLead: (id: string) => void;
}

const statusLabels: Record<string, string> = {
  in_sequence: "In Sequence",
  transferred: "Transferred",
  closed_won: "Closed Won",
};

const statusVariants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  in_sequence: "secondary",
  transferred: "outline",
  closed_won: "default",
};

const sourceLabels: Record<string, string> = {
  happydebt: "HappyDebt",
  client_upload: "Your Leads",
  ghl_sync: "GHL Sync",
};

export function LeadsTable({ statusFilter, search, onSelectLead }: LeadsTableProps) {
  const supabase = createClient();

  const { data, isLoading } = useQuery({
    queryKey: ["leads", statusFilter, search],
    queryFn: async () => {
      let query = supabase
        .from("leads")
        .select("*, closers(name)")
        .order("created_at", { ascending: false })
        .limit(100);

      if (statusFilter) query = query.eq("status", statusFilter);
      if (search) {
        query = query.or(
          `name.ilike.%${search}%,business_name.ilike.%${search}%,phone.ilike.%${search}%`
        );
      }

      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });

  if (isLoading) {
    return <Skeleton className="h-64 w-full rounded-xl" />;
  }

  const leads = data ?? [];

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50">
      <Table>
        <TableHeader>
          <TableRow className="border-zinc-800 hover:bg-transparent">
            <TableHead>Lead</TableHead>
            <TableHead>Business</TableHead>
            <TableHead>Source</TableHead>
            <TableHead>Closer</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Date</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {leads.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                No leads found.{" "}
                {!statusFilter && !search && "Upload a CSV or sync from GHL to get started."}
              </TableCell>
            </TableRow>
          ) : (
            leads.map((lead) => {
              const closer = lead.closers as { name: string } | null;
              return (
                <TableRow
                  key={lead.id}
                  className="border-zinc-800 cursor-pointer hover:bg-zinc-800/50"
                  onClick={() => onSelectLead(lead.id)}
                >
                  <TableCell className="font-medium">{lead.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {lead.business_name || "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {sourceLabels[lead.source] || lead.source}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {closer?.name || "Unassigned"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariants[lead.status] || "secondary"}>
                      {statusLabels[lead.status] || lead.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {lead.amount
                      ? new Intl.NumberFormat("en-US", {
                          style: "currency",
                          currency: "USD",
                        }).format(lead.amount)
                      : "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(lead.created_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </TableCell>
                  <TableCell>
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
