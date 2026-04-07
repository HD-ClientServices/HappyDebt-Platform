"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { DateRange } from "react-day-picker";
import { KPIRow } from "./KPIRow";
import { LeadsOverviewTable } from "./LeadsOverviewTable";
import { DateRangePicker } from "./DateRangePicker";
import { Skeleton } from "@/components/ui/skeleton";

const DailyBarChart = dynamic(
  () => import("./DailyBarChart").then((m) => ({ default: m.DailyBarChart })),
  { loading: () => <Skeleton className="h-[320px] w-full rounded-xl" /> }
);

function getDefaultRange(): DateRange {
  const now = new Date();
  return {
    from: new Date(now.getFullYear(), now.getMonth(), 1),
    to: now,
  };
}

export default function LiveTransfersPage() {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>(getDefaultRange);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-semibold">Live Transfers</h1>
        <DateRangePicker dateRange={dateRange} onDateRangeChange={setDateRange} />
      </div>
      <KPIRow dateRange={dateRange} />
      <DailyBarChart
        dateRange={dateRange}
        selectedDate={selectedDate}
        onSelectDate={(date) =>
          setSelectedDate((prev) => (prev === date ? null : date))
        }
      />
      <LeadsOverviewTable dateRange={dateRange} filterDate={selectedDate} />
    </div>
  );
}
