import { SuggestionsBanner } from "./SuggestionsBanner";
import { CloserRankingPanel } from "./CloserRankingPanel";
import { SentimentChart } from "./SentimentChart";
import { EvaluationScoreChart } from "./EvaluationScoreChart";
import { CriticalCallsPanel } from "./CriticalCallsPanel";

export default function VoCPage() {
  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-semibold">
        Voice of the Customer
      </h1>
      <SuggestionsBanner />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <CloserRankingPanel />
        </div>
        <div className="lg:col-span-2 space-y-6">
          <SentimentChart />
          <EvaluationScoreChart />
        </div>
      </div>
      <CriticalCallsPanel />
    </div>
  );
}
