"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
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
import { Loader2, CheckCircle2 } from "lucide-react";
import type { OrgRow } from "./OrgsPanel";

interface Props {
  org: OrgRow;
  open: boolean;
  onClose: () => void;
}

interface OrgConfig {
  id: string;
  name: string;
  slug: string;
  ghl_api_token: string | null;
  ghl_location_id: string | null;
  ghl_opening_pipeline_id: string | null;
  ghl_closing_pipeline_id: string | null;
  ghl_reconnect_webhook_url: string | null;
}

/**
 * Modal for intro_admin to configure GHL integration per organization:
 * - Opening Pipeline ID (used for Total Live Transfers count)
 * - Closing Pipeline ID (used to derive closing_status)
 * - Reconnect Webhook URL (POST endpoint that fires on "reconnect" button)
 *
 * Only intro_admin users can access these settings (enforced by the
 * /api/admin/orgs/[orgId]/config endpoint).
 */
export function OrgConfigDialog({ org, open, onClose }: Props) {
  const [openingPipelineId, setOpeningPipelineId] = useState("");
  const [closingPipelineId, setClosingPipelineId] = useState("");
  const [reconnectWebhookUrl, setReconnectWebhookUrl] = useState("");
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const { data, isLoading } = useQuery<OrgConfig | null>({
    queryKey: ["admin-org-config", org.id],
    enabled: open,
    queryFn: async () => {
      const res = await fetch(`/api/admin/orgs/${org.id}/config`);
      if (!res.ok) return null;
      return res.json();
    },
  });

  // Initialize form once data loads
  useEffect(() => {
    if (data) {
      setOpeningPipelineId(data.ghl_opening_pipeline_id ?? "");
      setClosingPipelineId(data.ghl_closing_pipeline_id ?? "");
      setReconnectWebhookUrl(data.ghl_reconnect_webhook_url ?? "");
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admin/orgs/${org.id}/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ghl_opening_pipeline_id: openingPipelineId || null,
          ghl_closing_pipeline_id: closingPipelineId || null,
          ghl_reconnect_webhook_url: reconnectWebhookUrl || null,
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
    },
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-zinc-900 border-zinc-800 max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-heading">
            Configure GHL — {org.name}
          </DialogTitle>
          <DialogDescription>
            Settings for the Live Transfers section. Only Intro staff can edit
            these values.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mx-auto" />
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="opening-pipeline">
                GHL Opening Pipeline ID
              </Label>
              <Input
                id="opening-pipeline"
                value={openingPipelineId}
                onChange={(e) => setOpeningPipelineId(e.target.value)}
                placeholder="e.g. 85kFh5EWKPg7qg9FDJfg"
                className="bg-zinc-800 border-zinc-700 font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                The pipeline whose &ldquo;won&rdquo; opportunities count as
                live transfers.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="closing-pipeline">
                GHL Closing Pipeline ID
              </Label>
              <Input
                id="closing-pipeline"
                value={closingPipelineId}
                onChange={(e) => setClosingPipelineId(e.target.value)}
                placeholder="e.g. xXSPcEgGwRNwxndym0c7"
                className="bg-zinc-800 border-zinc-700 font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                The pipeline where closers work the deal. Used to derive
                closed_won / closed_lost / pending_to_close.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reconnect-webhook">Reconnect Webhook URL</Label>
              <Input
                id="reconnect-webhook"
                value={reconnectWebhookUrl}
                onChange={(e) => setReconnectWebhookUrl(e.target.value)}
                placeholder="https://services.leadconnectorhq.com/hooks/.../webhook-trigger/..."
                className="bg-zinc-800 border-zinc-700 font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                The endpoint that fires when a user clicks the &ldquo;Reconnect
                lead&rdquo; button. Receives{" "}
                <code className="text-zinc-400">
                  {`{ contactId, source: "intro_platform_recontact" }`}
                </code>
                .
              </p>
            </div>

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
