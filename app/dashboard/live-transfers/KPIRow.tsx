"use client";

import { useQuery } from "@tanstack/react-query";
import { DateRange } from "react-day-picker";
import { createClient } from "@/lib/supabase/client";
import { StatCard } from "@/components/shared/StatCard";
import { useCurrentUserOrg } from "@/hooks/useCurrentUserOrg";

interface Props {
  dateRange: DateRange;
}

function rangeBounds(dateRange: DateRange) {
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

function useLiveTransfersKPIs(dateRange: DateRange, orgId: string | undefined) {
  const supabase = createClient();
  const { from, to } = rangeBounds(dateRange);

  return useQuery({
    queryKey: ["live-transfers-kpis", orgId, from, to],
    enabled: !!orgId,
    queryFn: async () => {
      const { data: transfers } = await supabase
        .from("live_transfers")
        .select("id, status, closer_id, transfer_date")
        .eq("org_id", orgId!)
        .gte("transfer_date", from)
        .lte("transfer_date", to);

      const total = transfers?.length ?? 0;
      const transferred = transfers?.filter((t) => t.status === "transferred").length ?? 0;
      const funded = transfers?.filter((t) => t.status === "funded").length ?? 0;
      const conversionRate = total > 0 ? Math.round((funded / total) * 100) : 0;

      const byCloser = (transfers ?? []).reduce<Record<string, number>>((acc, t) => {
        const id = t.closer_id ?? "unknown";
        acc[id] = (acc[id] ?? 0) + 1;
        return acc;
      }, {});
      const topCloserId = Object.entries(byCloser).sort((a, b) => b[1] - a[1])[0]?.[0];
      const { data: closers } = await supabase
        .from("closers")
        .select("id, name")
        .eq("org_id", orgId!);
      const topCloserName =
        topCloserId && closers
          ? closers.find((c) => c.id === topCloserId)?.name ?? "—"
          : "—";

      return { total, transferred, funded, conversionRate, topCloserName };
    },
  });
}

export function KPIRow({ dateRange }: Props) {
  const { data: userOrg } = useCurrentUserOrg();
  const { data, isLoading } = useLiveTransfersKPIs(dateRange, userOrg?.orgId);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {[1, 2, 3, 4, 5].map((i) => (
          <StatCard key={i} title="..." value="--" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
      <StatCard title="Total Live Transfers" value={data?.total ?? 0} />
      <StatCard title="Transferred" value={data?.transferred ?? 0} />
      <StatCard title="Funded" value={data?.funded ?? 0} />
      <StatCard
        title="Conversion Rate"
        value={`${data?.conversionRate ?? 0}%`}
        trend={
          data && data.conversionRate >= 50
            ? "positive"
            : data && data.conversionRate < 20
              ? "negative"
              : "neutral"
        }
      />
      <StatCard title="Top Closer" value={data?.topCloserName ?? "—"} />
    </div>
  );
}
