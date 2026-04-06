import dynamic from "next/dynamic";
import { KPIRow } from "./KPIRow";
import { LiveTransfersTable } from "./LiveTransfersTable";
import { Skeleton } from "@/components/ui/skeleton";

const DailyBarChart = dynamic(
  () => import("./DailyBarChart").then((m) => ({ default: m.DailyBarChart })),
  { loading: () => <Skeleton className="h-[320px] w-full rounded-xl" /> }
);

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
