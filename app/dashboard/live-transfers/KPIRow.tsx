"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { StatCard } from "@/components/shared/StatCard";

function useOverviewKPIs() {
  const supabase = createClient();
  return useQuery({
    queryKey: ["overview-kpis"],
    queryFn: async () => {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      const { data: leads } = await supabase
        .from("leads")
        .select("id, status, closer_id, created_at")
        .gte("created_at", startOfMonth);

      const total = leads?.length ?? 0;
      const transferred = leads?.filter((l) => l.status === "transferred").length ?? 0;
      const closedWon = leads?.filter((l) => l.status === "closed_won").length ?? 0;
      const conversionRate = transferred > 0 ? Math.round((closedWon / transferred) * 100) : 0;

      const byCloser = (leads ?? []).reduce<Record<string, number>>((acc, l) => {
        const id = l.closer_id ?? "unknown";
        acc[id] = (acc[id] ?? 0) + 1;
        return acc;
      }, {});
      const topCloserId = Object.entries(byCloser).sort((a, b) => b[1] - a[1])[0]?.[0];
      const { data: closers } = await supabase.from("closers").select("id, name");
      const topCloserName =
        topCloserId && closers
          ? closers.find((c) => c.id === topCloserId)?.name ?? "—"
          : "—";

      return { total, transferred, closedWon, conversionRate, topCloserName };
    },
  });
}

export function KPIRow() {
  const { data, isLoading } = useOverviewKPIs();

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
      <StatCard title="Total Leads" value={data?.total ?? 0} />
      <StatCard title="Transferred" value={data?.transferred ?? 0} />
      <StatCard title="Closed Won" value={data?.closedWon ?? 0} />
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
