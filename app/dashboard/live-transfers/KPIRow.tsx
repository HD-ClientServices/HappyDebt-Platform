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
      // Pull all rows in range with closing_status to compute conversion
      // and find the top closer.
      const { data: transfers } = await supabase
        .from("live_transfers")
        .select("id, closing_status, closer_id, status_change_date")
        .eq("org_id", orgId!)
        .gte("status_change_date", from)
        .lte("status_change_date", to);

      const total = transfers?.length ?? 0;
      const closedWon = transfers?.filter((t) => t.closing_status === "closed_won").length ?? 0;
      const closedLost = transfers?.filter((t) => t.closing_status === "closed_lost").length ?? 0;

      // Conversion rate per user spec: closed_won / (closed_won + closed_lost)
      // Pending to close and disqualified are excluded from the denominator.
      const conversionRate =
        closedWon + closedLost > 0
          ? Math.round((closedWon / (closedWon + closedLost)) * 100)
          : 0;

      // Top closer by closed_won count
      const wonByCloser = (transfers ?? [])
        .filter((t) => t.closing_status === "closed_won")
        .reduce<Record<string, number>>((acc, t) => {
          const id = t.closer_id ?? "unknown";
          acc[id] = (acc[id] ?? 0) + 1;
          return acc;
        }, {});
      const topCloserId = Object.entries(wonByCloser).sort(
        (a, b) => b[1] - a[1]
      )[0]?.[0];

      let topCloserName = "—";
      if (topCloserId && topCloserId !== "unknown") {
        const { data: closer } = await supabase
          .from("closers")
          .select("name")
          .eq("id", topCloserId)
          .maybeSingle();
        topCloserName = closer?.name ?? "—";
      }

      return { total, closedWon, closedLost, conversionRate, topCloserName };
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
      <StatCard title="Closed Won" value={data?.closedWon ?? 0} />
      <StatCard title="Closed Lost" value={data?.closedLost ?? 0} />
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
