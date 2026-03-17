"use client";

import { useState } from "react";
import { DateRange } from "react-day-picker";
import { KPIRow } from "./KPIRow";
import { LiveTransfersTable } from "./LiveTransfersTable";
import { DailyBarChart } from "./DailyBarChart";
import { DateRangePicker } from "./DateRangePicker";

function getDefaultRange(): DateRange {
  const now = new Date();
  return {
    from: new Date(now.getFullYear(), now.getMonth(), 1),
    to: now,
  };
}

export default function OverviewPage() {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>(getDefaultRange);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-semibold">Overview</h1>
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
      <LiveTransfersTable dateRange={dateRange} filterDate={selectedDate} />
    </div>
  );
}
