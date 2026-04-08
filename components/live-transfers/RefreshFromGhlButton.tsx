"use client";

import { useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { RefreshCw, Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/api-client";

interface Props {
  /** When true, automatically triggers a sync on first mount (background). */
  autoSyncOnMount?: boolean;
}

/**
 * Module-level guard that survives React StrictMode double-mount in dev
 * and any same-session remount (e.g. navigating away and back to the
 * Live Transfers page within the same tab).
 *
 * A previous version used a `useRef` to track the auto-sync, but refs
 * are per-component-instance — StrictMode mounts, unmounts, and remounts
 * the component synchronously, creating a second instance whose ref
 * starts fresh. The result was two parallel POSTs to /api/pipeline/sync,
 * which then collided on the `live_transfers_ghl_opportunity_id_key`
 * unique constraint and surfaced as duplicate-key errors in the logs.
 *
 * Keeping this flag at module scope (not inside the component) means
 * the second StrictMode instance sees `true` and skips the call. Manual
 * clicks still work — they don't touch this flag.
 */
let hasAutoSynced = false;

/**
 * Refresh-from-GHL button that triggers /api/pipeline/sync, which pulls
 * fresh opportunities from the opening + closing pipelines and updates
 * the live_transfers table. After success, invalidates all live-transfers
 * React Query keys so the UI refetches with the new data.
 */
export function RefreshFromGhlButton({ autoSyncOnMount = true }: Props) {
  const queryClient = useQueryClient();

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
  // always fresh when an admin opens it. The module-level flag above
  // ensures we don't fire twice under StrictMode or on remounts.
  useEffect(() => {
    if (autoSyncOnMount && !hasAutoSynced) {
      hasAutoSynced = true;
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
