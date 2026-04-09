"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, CheckCircle2, Workflow } from "lucide-react";
import type { GHLPipeline } from "@/lib/ghl/types";
import type { OrgRow } from "./OrgsPanel";

interface Props {
  org: OrgRow;
  open: boolean;
  onClose: () => void;
}

interface OrgPipelineConfig {
  ghl_opening_pipeline_id: string | null;
  ghl_closing_pipeline_id: string | null;
}

/**
 * Admin → Organizations → Configure Pipelines dialog.
 *
 * Lets intro_admin edit which GHL pipelines belong to a specific
 * client org. The GHL account is shared across every org (credentials
 * live in the singleton `ghl_integration` table) but each client
 * works inside its OWN opening and closing pipelines within that
 * shared account.
 *
 * The pipeline dropdowns are populated from the live GHL account —
 * we call `/api/pipeline/pipelines` which proxies `getPipelines()`
 * from GHL using the global credentials. That way the admin sees
 * every pipeline available in the account regardless of which org
 * currently owns which one.
 *
 * Writes go through `/api/admin/orgs/[orgId]/pipelines`, which is
 * gated on intro_admin. This dialog never touches credentials or
 * the reconnect webhook — those are global config and live under
 * Admin → GHL Integration.
 */
export function OrgPipelineDialog({ org, open, onClose }: Props) {
  const queryClient = useQueryClient();

  const [openingPipelineId, setOpeningPipelineId] = useState("");
  const [closingPipelineId, setClosingPipelineId] = useState("");
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // ── Current org pipeline config ─────────────────────────────────
  const { data: config, isLoading: configLoading } =
    useQuery<OrgPipelineConfig | null>({
      queryKey: ["admin-org-pipelines", org.id],
      enabled: open,
      queryFn: async () => {
        const res = await fetch(`/api/admin/orgs/${org.id}/pipelines`);
        if (!res.ok) return null;
        return res.json();
      },
    });

  // Initialise the form once the config loads.
  useEffect(() => {
    if (!config) return;
    setOpeningPipelineId(config.ghl_opening_pipeline_id ?? "");
    setClosingPipelineId(config.ghl_closing_pipeline_id ?? "");
    setSavedAt(null);
  }, [config]);

  // ── Available pipelines (from the global GHL account) ──────────
  const { data: pipelinesData, isLoading: pipelinesLoading } = useQuery<{
    pipelines: GHLPipeline[];
  }>({
    queryKey: ["admin-ghl-pipelines"],
    enabled: open,
    queryFn: async () => {
      const res = await fetch("/api/pipeline/pipelines");
      if (!res.ok) return { pipelines: [] };
      return res.json();
    },
    refetchOnWindowFocus: false,
  });

  const pipelines = pipelinesData?.pipelines ?? [];

  // ── Save mutation ─────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admin/orgs/${org.id}/pipelines`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ghl_opening_pipeline_id: openingPipelineId || null,
          ghl_closing_pipeline_id: closingPipelineId || null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to save");
      }
      return res.json();
    },
    onSuccess: () => {
      setSavedAt(Date.now());
      setTimeout(() => setSavedAt(null), 2000);
      queryClient.invalidateQueries({
        queryKey: ["admin-org-pipelines", org.id],
      });
      // The OrgsPanel may show a "Pipelines configured" badge that
      // depends on this data; invalidate its list query too.
      queryClient.invalidateQueries({ queryKey: ["admin-orgs"] });
    },
  });

  const isLoading = configLoading || pipelinesLoading;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-zinc-900 border-zinc-800 max-w-xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <Workflow className="h-5 w-5 text-emerald-500" />
            <div className="flex-1">
              <DialogTitle className="font-heading">
                Configure Pipelines — {org.name}
              </DialogTitle>
              <DialogDescription>
                Which GHL pipelines does this organization use? The
                platform syncs won opportunities from the opening
                pipeline and derives closing status from the closing
                pipeline.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {isLoading ? (
          <div className="py-10 text-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mx-auto" />
          </div>
        ) : (
          <div className="space-y-5 py-2">
            {/* Opening pipeline */}
            <div className="space-y-2">
              <Label htmlFor="opening-pipeline">Opening Pipeline</Label>
              {pipelines.length > 0 ? (
                <select
                  id="opening-pipeline"
                  value={openingPipelineId}
                  onChange={(e) => setOpeningPipelineId(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">— None —</option>
                  {pipelines.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  id="opening-pipeline"
                  value={openingPipelineId}
                  onChange={(e) => setOpeningPipelineId(e.target.value)}
                  placeholder="e.g. 85kFh5EWKPg7qg9FDJfg"
                  className="bg-zinc-800 border-zinc-700 font-mono text-xs"
                />
              )}
              <p className="text-xs text-muted-foreground">
                Won opportunities from this pipeline become live
                transfers for <strong>{org.name}</strong>. Drives the
                &ldquo;Total Live Transfers&rdquo; KPI.
              </p>
            </div>

            {/* Closing pipeline */}
            <div className="space-y-2">
              <Label htmlFor="closing-pipeline">Closing Pipeline</Label>
              {pipelines.length > 0 ? (
                <select
                  id="closing-pipeline"
                  value={closingPipelineId}
                  onChange={(e) => setClosingPipelineId(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">— None —</option>
                  {pipelines.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  id="closing-pipeline"
                  value={closingPipelineId}
                  onChange={(e) => setClosingPipelineId(e.target.value)}
                  placeholder="e.g. xXSPcEgGwRNwxndym0c7"
                  className="bg-zinc-800 border-zinc-700 font-mono text-xs"
                />
              )}
              <p className="text-xs text-muted-foreground">
                The pipeline closers work the deal in. Used to derive{" "}
                <code className="text-zinc-400">closed_won</code>,{" "}
                <code className="text-zinc-400">closed_lost</code>,{" "}
                <code className="text-zinc-400">pending_to_close</code>{" "}
                and <code className="text-zinc-400">disqualified</code>.
              </p>
            </div>

            {pipelines.length === 0 && (
              <p className="text-xs text-amber-400">
                Couldn&apos;t load live pipelines from GHL. Check the
                credentials under Admin → GHL Integration.
              </p>
            )}

            {saveMutation.isError && (
              <p className="text-sm text-rose-400">
                {saveMutation.error instanceof Error
                  ? saveMutation.error.message
                  : "Failed to save"}
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
            className="border-zinc-700"
            disabled={saveMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || isLoading}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {saveMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            {savedAt && <CheckCircle2 className="mr-2 h-4 w-4" />}
            {savedAt ? "Saved!" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
