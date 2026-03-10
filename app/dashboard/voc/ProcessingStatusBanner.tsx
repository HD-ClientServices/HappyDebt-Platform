"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, AlertTriangle, CheckCircle2, Clock } from "lucide-react";

interface PipelineStatus {
  jobs: {
    id: string;
    status: string;
    job_type: string;
    error_message: string | null;
    attempts: number;
    created_at: string;
    payload: Record<string, string>;
  }[];
  summary: {
    pending: number;
    processing: number;
    completed: number;
    failed: number;
  };
}

export function ProcessingStatusBanner() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<PipelineStatus>({
    queryKey: ["pipeline-status"],
    queryFn: async () => {
      const res = await fetch("/api/pipeline/status");
      if (!res.ok) throw new Error("Failed to fetch status");
      return res.json();
    },
    refetchInterval: 10_000, // Poll every 10s
  });

  const retryMutation = useMutation({
    mutationFn: async (jobId: string) => {
      const res = await fetch("/api/pipeline/process", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-pipeline-secret": "", // client can't use this; rely on cron
        },
        body: JSON.stringify({ jobId }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pipeline-status"] });
    },
  });

  if (isLoading || !data) return null;

  const { summary } = data;
  const activeCount = summary.pending + summary.processing;
  const failedJobs = data.jobs.filter(
    (j) => j.status === "failed" && j.attempts < 3
  );

  // Nothing to show
  if (activeCount === 0 && failedJobs.length === 0) return null;

  return (
    <Card className="bg-zinc-900/80 border-zinc-800">
      <CardContent className="py-4">
        <div className="flex flex-wrap items-center gap-4">
          {/* Active processing */}
          {activeCount > 0 && (
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
              <span className="text-sm text-zinc-300">
                Processing {activeCount} call{activeCount !== 1 ? "s" : ""}…
              </span>
              <Badge
                variant="outline"
                className="border-blue-500/30 text-blue-400"
              >
                <Clock className="mr-1 h-3 w-3" />
                {summary.pending} pending
              </Badge>
              {summary.processing > 0 && (
                <Badge
                  variant="outline"
                  className="border-yellow-500/30 text-yellow-400"
                >
                  {summary.processing} in progress
                </Badge>
              )}
            </div>
          )}

          {/* Completed count */}
          {summary.completed > 0 && (
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <span className="text-sm text-zinc-400">
                {summary.completed} completed
              </span>
            </div>
          )}

          {/* Failed jobs */}
          {failedJobs.length > 0 && (
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-400" />
              <span className="text-sm text-red-400">
                {failedJobs.length} failed
              </span>
              {failedJobs.map((job) => (
                <Button
                  key={job.id}
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs border-red-500/30 text-red-400 hover:bg-red-500/10"
                  onClick={() => retryMutation.mutate(job.id)}
                  disabled={retryMutation.isPending}
                >
                  Retry {job.payload?.contact_name || "call"}
                </Button>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
