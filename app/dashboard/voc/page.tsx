import dynamic from "next/dynamic";
import { SuggestionsBanner } from "./SuggestionsBanner";
import { CloserRankingPanel } from "./CloserRankingPanel";
import { CriticalCallsPanel } from "./CriticalCallsPanel";
import { ProcessingStatusBanner } from "./ProcessingStatusBanner";
import { Skeleton } from "@/components/ui/skeleton";

const SentimentChart = dynamic(
  () => import("./SentimentChart").then((m) => ({ default: m.SentimentChart })),
  { loading: () => <Skeleton className="h-[320px] w-full rounded-xl" /> }
);

const EvaluationScoreChart = dynamic(
  () => import("./EvaluationScoreChart").then((m) => ({ default: m.EvaluationScoreChart })),
  { loading: () => <Skeleton className="h-[320px] w-full rounded-xl" /> }
);

const QACriteriaChart = dynamic(
  () => import("./QACriteriaChart").then((m) => ({ default: m.QACriteriaChart })),
  { loading: () => <Skeleton className="h-[320px] w-full rounded-xl" /> }
);

export default function VoCPage() {
  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-semibold">
        Voice of the Customer
      </h1>
      <ProcessingStatusBanner />
      <SuggestionsBanner />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <CloserRankingPanel />
        </div>
        <div className="lg:col-span-2 space-y-6">
          <SentimentChart />
          <EvaluationScoreChart />
          <QACriteriaChart />
        </div>
      </div>
      <CriticalCallsPanel />
    </div>
  );
}
