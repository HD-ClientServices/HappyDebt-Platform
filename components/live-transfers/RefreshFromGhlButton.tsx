"use client";

import { useEffect, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { RefreshCw, Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/api-client";

interface Props {
  /** When true, automatically triggers a sync on first mount (background). */
  autoSyncOnMount?: boolean;
}

/**
 * Refresh-from-GHL button that triggers /api/pipeline/sync, which pulls
 * fresh opportunities from the opening + closing pipelines and updates
 * the live_transfers table. After success, invalidates all live-transfers
 * React Query keys so the UI refetches with the new data.
 */
export function RefreshFromGhlButton({ autoSyncOnMount = true }: Props) {
  const queryClient = useQueryClient();
  const triggeredAuto = useRef(false);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch("/api/pipeline/sync", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Sync failed");
      }
      return res.json();
    },
    onSuccess: () => {
      // Invalidate all live-transfers queries so KPIs/chart/table refetch
      queryClient.invalidateQueries({
        predicate: (q) => {
          const key = String(q.queryKey[0] ?? "");
          return key.startsWith("live-transfers");
        },
      });
    },
  });

  // Auto-sync on first mount (background, non-blocking) so the page is
  // always fresh when an admin opens it. Re-mounts within the same session
  // do not retrigger.
  useEffect(() => {
    if (autoSyncOnMount && !triggeredAuto.current) {
      triggeredAuto.current = true;
      mutation.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSyncOnMount]);

  return (
    <Button
      variant="outline"
      size="sm"
      className="border-zinc-700"
      onClick={() => mutation.mutate()}
      disabled={mutation.isPending}
      title="Refresh data from Go High Level"
    >
      {mutation.isPending ? (
        <>
          <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
          Syncing…
        </>
      ) : (
        <>
          <RefreshCw className="mr-2 h-3.5 w-3.5" />
          Refresh from GHL
        </>
      )}
    </Button>
  );
}
