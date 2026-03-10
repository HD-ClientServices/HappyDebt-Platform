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
      const { data: transfers } = await supabase
        .from("live_transfers")
        .select("id, status, closer_id, transfer_date")
        .gte("transfer_date", startOfMonth);
      const total = transfers?.length ?? 0;
      const funded = transfers?.filter((t) => t.status === "funded").length ?? 0;
      const rate = total > 0 ? Math.round((funded / total) * 100) : 0;
      const byCloser = (transfers ?? []).reduce<Record<string, number>>((acc, t) => {
        const id = t.closer_id ?? "unknown";
        acc[id] = (acc[id] ?? 0) + 1;
        return acc;
      }, {});
      const topCloserId = Object.entries(byCloser).sort((a, b) => b[1] - a[1])[0]?.[0];
      const { data: closers } = await supabase.from("closers").select("id, name");
      const topCloserName = topCloserId && closers ? closers.find((c) => c.id === topCloserId)?.name ?? "—" : "—";
      return { total, funded, rate, topCloserName };
    },
  });
}

export function KPIRow() {
  const { data, isLoading } = useOverviewKPIs();

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <StatCard key={i} title="…" value="—" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard title="Total Live Transfers (this month)" value={data?.total ?? 0} />
      <StatCard title="Total Funded (this month)" value={data?.funded ?? 0} />
      <StatCard
        title="Transfer-to-Fund Rate"
        value={`${data?.rate ?? 0}%`}
        trend={data && data.rate >= 50 ? "positive" : data && data.rate < 30 ? "negative" : "neutral"}
      />
      <StatCard title="Top Closer" value={data?.topCloserName ?? "—"} />
    </div>
  );
}
