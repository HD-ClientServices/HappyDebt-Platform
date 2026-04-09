"use client";

import { useQuery } from "@tanstack/react-query";
import { DateRange } from "react-day-picker";
import { createClient } from "@/lib/supabase/client";
import { StatCard } from "@/components/shared/StatCard";
import { useCurrentUserOrg } from "@/hooks/useCurrentUserOrg";
import { formatUSD } from "@/lib/utils/format-currency";

interface Props {
  dateRange: DateRange;
}

/**
 * Minimum number of closed deals (won + lost) a closer must have in
 * the selected date range before they can appear as "Top Closer".
 * Without this, someone with a single 1-0 record would win with 100%
 * closing rate and crowd out genuinely high-performing closers.
 *
 * If the volume at Rise grows past a few hundred deals per month we
 * can bump this (probably to 5 or 10) or move it into the Admin →
 * Organizations config dialog as a per-org setting.
 */
const MIN_QUALIFYING_DEALS_FOR_TOP_CLOSER = 3;

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
      // Pull the period's live_transfers. `amount` feeds the Total Debt
      // and Enrolled Debt KPIs; `closer_id` + `closing_status` feed the
      // Top Closer ranking and Closing Rate.
      const { data: transfers } = await supabase
        .from("live_transfers")
        .select("id, closing_status, closer_id, status_change_date, amount")
        .eq("org_id", orgId!)
        .gte("status_change_date", from)
        .lte("status_change_date", to);

      const rows = transfers ?? [];
      const total = rows.length;
      const closedWon = rows.filter((t) => t.closing_status === "closed_won").length;
      const closedLost = rows.filter((t) => t.closing_status === "closed_lost").length;

      // Closing rate per product spec: closed_won / (closed_won + closed_lost).
      // pending_to_close and disqualified are excluded from the denominator —
      // they're still in progress and shouldn't drag the rate down.
      const closingRate =
        closedWon + closedLost > 0
          ? Math.round((closedWon / (closedWon + closedLost)) * 100)
          : 0;

      // Debt totals. Numeric columns come back as strings from PostgREST
      // for `decimal` types, so we coerce defensively.
      const totalDebt = rows.reduce(
        (sum, t) => sum + Number(t.amount ?? 0),
        0
      );
      const enrolledDebt = rows
        .filter((t) => t.closing_status === "closed_won")
        .reduce((sum, t) => sum + Number(t.amount ?? 0), 0);

      // Top closer by CLOSING RATE (not raw closed_won count). A closer
      // must have at least `MIN_QUALIFYING_DEALS_FOR_TOP_CLOSER` closed
      // deals to be eligible — this prevents someone with one 1-0 record
      // from sitting at the top of the list forever.
      //
      // Tiebreaker: when two closers have identical rates, the one with
      // more total deals wins.
      const statsByCloser = new Map<string, { won: number; lost: number }>();
      for (const t of rows) {
        if (!t.closer_id) continue;
        if (t.closing_status !== "closed_won" && t.closing_status !== "closed_lost") continue;
        const entry = statsByCloser.get(t.closer_id) ?? { won: 0, lost: 0 };
        if (t.closing_status === "closed_won") entry.won++;
        else entry.lost++;
        statsByCloser.set(t.closer_id, entry);
      }

      const rankedClosers = Array.from(statsByCloser.entries())
        .map(([id, s]) => ({
          id,
          rate: s.won + s.lost > 0 ? s.won / (s.won + s.lost) : 0,
          totalDeals: s.won + s.lost,
        }))
        .filter((r) => r.totalDeals >= MIN_QUALIFYING_DEALS_FOR_TOP_CLOSER)
        .sort((a, b) => b.rate - a.rate || b.totalDeals - a.totalDeals);

      const topCloserId = rankedClosers[0]?.id;

      let topCloserName = "—";
      if (topCloserId) {
        const { data: closer } = await supabase
          .from("closers")
          .select("name")
          .eq("id", topCloserId)
          .maybeSingle();
        topCloserName = closer?.name ?? "—";
      }

      return {
        total,
        closedWon,
        closedLost, // kept internally for the closing-rate denominator
        closingRate,
        totalDebt,
        enrolledDebt,
        topCloserName,
      };
    },
  });
}

export function KPIRow({ dateRange }: Props) {
  const { data: userOrg } = useCurrentUserOrg();
  const { data, isLoading } = useLiveTransfersKPIs(dateRange, userOrg?.orgId);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <StatCard key={i} title="..." value="--" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
      <StatCard title="Total Live Transfers" value={data?.total ?? 0} />
      <StatCard title="Closed Won" value={data?.closedWon ?? 0} />
      <StatCard
        title="Closing Rate"
        value={`${data?.closingRate ?? 0}%`}
        trend={
          data && data.closingRate >= 50
            ? "positive"
            : data && data.closingRate < 20
              ? "negative"
              : "neutral"
        }
      />
      <StatCard
        title="Total Debt"
        value={formatUSD(data?.totalDebt, { compact: true })}
      />
      <StatCard
        title="Enrolled Debt"
        value={formatUSD(data?.enrolledDebt, { compact: true })}
      />
      <StatCard title="Top Closer" value={data?.topCloserName ?? "—"} />
    </div>
  );
}
