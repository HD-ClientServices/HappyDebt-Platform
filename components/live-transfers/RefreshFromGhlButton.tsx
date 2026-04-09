"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/utils";

/**
 * Refresh-from-GHL button that triggers `/api/pipeline/sync`, which
 * pulls fresh opportunities from the opening + closing pipelines and
 * updates the `live_transfers` table. After success it invalidates
 * every `live-transfers*` React Query key so the KPIs, chart, and
 * table all refetch with the new data.
 *
 * The sync runs ONLY when:
 *   1. A user clicks this button, or
 *   2. The daily Vercel cron at 04:17 UTC fires
 *      `/api/cron/process-pending`, which kicks off an internal sync
 *      before retrying any stuck processing jobs.
 *
 * Earlier versions of this component auto-synced on mount as a
 * convenience so the page was always fresh when an admin opened it.
 * That caused the button to display "Syncing…" every time the page
 * loaded and effectively double-triggered the sync from the cron
 * cadence. Auto-sync was removed — the daily cron is enough to keep
 * the dashboard fresh without firing a sync on every page load.
 *
 * Styling note: this button mirrors the DateRangePicker trigger
 * (`rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm`)
 * so the two controls align on the same horizontal row without one
 * looking visually shorter than the other.
 */
export function RefreshFromGhlButton() {
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
      // Invalidate every live-transfers query so KPIs / chart / table
      // all refetch with the newly-synced rows.
      queryClient.invalidateQueries({
        predicate: (q) => {
          const key = String(q.queryKey[0] ?? "");
          return key.startsWith("live-transfers");
        },
      });
    },
  });

  return (
    <button
      type="button"
      onClick={() => mutation.mutate()}
      disabled={mutation.isPending}
      title="Refresh data from Go High Level"
      className={cn(
        "inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-300 transition-colors hover:bg-zinc-800 hover:border-zinc-600 disabled:pointer-events-none disabled:opacity-60"
      )}
    >
      {mutation.isPending ? (
        <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />
      ) : (
        <RefreshCw className="h-4 w-4 text-zinc-500" />
      )}
      Refresh
    </button>
  );
}
