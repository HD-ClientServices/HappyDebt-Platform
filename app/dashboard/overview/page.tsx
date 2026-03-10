import { KPIRow } from "./KPIRow";
import { LiveTransfersTable } from "./LiveTransfersTable";
import { DailyBarChart } from "./DailyBarChart";

export default function OverviewPage() {
  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-semibold">Overview</h1>
      <KPIRow />
      <DailyBarChart />
      <LiveTransfersTable />
    </div>
  );
}
