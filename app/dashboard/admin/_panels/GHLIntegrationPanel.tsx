"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Plug2,
  AlertTriangle,
  Info,
} from "lucide-react";

/**
 * Admin → GHL Integration panel.
 *
 * Single source of truth for the **global** Go High Level credentials
 * — the api_token, location_id, and reconnect webhook URL. There is
 * ONE GHL account for the entire platform, and these three fields
 * are everything the platform needs to talk to it.
 *
 * ## What's NOT here
 *
 * Opening and closing pipeline IDs are **per-org**, not global. Each
 * client organization has its own opening/closing pipelines inside
 * the shared GHL account. The sync and webhook routing logic uses
 * the pipeline_id to figure out which org owns each opportunity. To
 * configure pipelines for a specific org, go to:
 *
 *   Admin → Organizations → Configure Pipelines (per org card)
 *
 * The earlier iteration of this panel had opening/closing dropdowns
 * at the global level; that modeling was wrong because it forced
 * every org's opportunities to live under the same pipeline_id. See
 * migration 00016 for the writeup.
 *
 * All read/writes go through `/api/admin/ghl-integration`. That
 * endpoint enforces intro_admin access; this component does no auth
 * check of its own (mounted from the server-rendered Admin page
 * that's already gated).
 */

interface GHLConfig {
  api_token: string | null;
  location_id: string | null;
  reconnect_webhook_url: string | null;
  updated_at?: string;
  updated_by?: string;
  migration_pending?: boolean;
}

export function GHLIntegrationPanel() {
  const queryClient = useQueryClient();

  // Form state — initialised once data loads
  const [token, setToken] = useState("");
  const [locationId, setLocationId] = useState("");
  const [reconnectWebhookUrl, setReconnectWebhookUrl] = useState("");

  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [testStatus, setTestStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [testMessage, setTestMessage] = useState("");

  // ── Load current config ──────────────────────────────────────────
  const { data: config, isLoading } = useQuery<GHLConfig | null>({
    queryKey: ["admin-ghl-integration"],
    queryFn: async () => {
      const res = await fetch("/api/admin/ghl-integration");
      if (!res.ok) return null;
      return res.json();
    },
  });

  // Initialise form values once when the data first loads.
  useEffect(() => {
    if (!config) return;
    setToken(config.api_token ?? "");
    setLocationId(config.location_id ?? "");
    setReconnectWebhookUrl(config.reconnect_webhook_url ?? "");
  }, [config]);

  const isConnected = !!(config?.api_token && config?.location_id);
  const migrationPending = config?.migration_pending === true;

  // ── Save mutation ────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/ghl-integration", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_token: token,
          location_id: locationId,
          reconnect_webhook_url: reconnectWebhookUrl || null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Save failed: HTTP ${res.status}`);
      }
      return res.json();
    },
    onSuccess: () => {
      setSavedAt(Date.now());
      setTimeout(() => setSavedAt(null), 2000);
      queryClient.invalidateQueries({ queryKey: ["admin-ghl-integration"] });
    },
  });

  // ── Test Connection (fetch GHL directly with current form values) ─
  const handleTestConnection = async () => {
    if (!token || !locationId) {
      setTestStatus("error");
      setTestMessage("Please enter both API Token and Location ID.");
      return;
    }
    setTestStatus("loading");
    setTestMessage("");
    try {
      const res = await fetch(
        `https://services.leadconnectorhq.com/users/?locationId=${encodeURIComponent(locationId)}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Version: "2021-07-28",
          },
        }
      );
      if (res.ok) {
        const body = await res.json();
        const count = body.users?.length ?? 0;
        setTestStatus("success");
        setTestMessage(
          `Connected — found ${count} user(s) in this GHL location.`
        );
      } else {
        const body = await res.json().catch(() => ({}));
        setTestStatus("error");
        setTestMessage(
          `Connection failed: HTTP ${res.status}${body.message ? ` — ${body.message}` : ""}`
        );
      }
    } catch (err) {
      setTestStatus("error");
      setTestMessage(
        `Connection error: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  };

  // ── Sync mutation (runs the sync for ALL configured orgs) ───────
  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/pipeline/sync", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Sync failed: ${res.status}`);
      }
      return res.json();
    },
    onSuccess: () => {
      // Bust every dashboard cache that depends on synced data so the
      // next page mount sees the fresh state.
      queryClient.invalidateQueries({ queryKey: ["live-transfers"] });
      queryClient.invalidateQueries({ queryKey: ["live-transfers-kpis"] });
      queryClient.invalidateQueries({ queryKey: ["live-transfers-daily"] });
      queryClient.invalidateQueries({ queryKey: ["overview-kpis"] });
      queryClient.invalidateQueries({ queryKey: ["closers"] });
      queryClient.invalidateQueries({ queryKey: ["pipeline-status"] });
    },
  });

  if (isLoading) {
    return (
      <Card className="bg-zinc-900/80 border-zinc-800">
        <CardContent className="py-10 text-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mx-auto" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-zinc-900/80 border-zinc-800">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Plug2 className="h-5 w-5 text-emerald-500" />
            <div>
              <CardTitle className="font-heading">
                Go High Level Integration
              </CardTitle>
              <CardDescription>
                Global credentials for the single GHL account. Pipeline
                selection is per-organization (see Organizations tab).
              </CardDescription>
            </div>
          </div>
          <Badge
            variant={isConnected ? "default" : "outline"}
            className={
              isConnected
                ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30"
                : ""
            }
          >
            {isConnected ? "Connected" : "Not Connected"}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Migration warning */}
        {migrationPending && (
          <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-amber-400">
                Database migration required
              </p>
              <p className="text-muted-foreground mt-1">
                Run{" "}
                <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-xs">
                  supabase/migrations/00015_unify_ghl_integration.sql
                </code>{" "}
                in the Supabase SQL Editor to enable the global GHL config.
              </p>
            </div>
          </div>
        )}

        {/* Credentials */}
        <div className="space-y-4 max-w-2xl">
          <div className="space-y-2">
            <Label htmlFor="ghl-token">GHL API Token</Label>
            <Input
              id="ghl-token"
              type="password"
              placeholder="pit-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="bg-zinc-800 border-zinc-700 font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              Private Integration Token from GHL → Settings → Private
              Integrations. Stored encrypted at rest.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ghl-location">GHL Location ID</Label>
            <Input
              id="ghl-location"
              placeholder="XXXXXXXXXXXXXXXX"
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              className="bg-zinc-800 border-zinc-700 font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              The sub-account id this token is scoped to. Visible in the
              GHL URL when viewing the location.
            </p>
          </div>
        </div>

        {/* Reconnect webhook */}
        <div className="space-y-4 max-w-2xl pt-2 border-t border-zinc-800">
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
              Endpoint fired when a user clicks the &ldquo;Reconnect
              lead&rdquo; button in Live Transfers. Receives{" "}
              <code className="text-zinc-400">
                {`{ contactId, source: "intro_platform_recontact" }`}
              </code>
              .
            </p>
          </div>
        </div>

        {/* Pipelines are per-org — info box */}
        <div className="rounded-lg bg-blue-500/5 border border-blue-500/25 p-4 flex items-start gap-3 max-w-2xl">
          <Info className="h-5 w-5 text-blue-400 shrink-0 mt-0.5" />
          <div className="text-sm text-zinc-300 space-y-1">
            <p className="font-medium text-blue-300">
              Pipelines are configured per-organization
            </p>
            <p className="text-muted-foreground">
              Each client org has its own opening and closing pipelines
              inside the shared GHL account. To set them, go to{" "}
              <strong className="text-zinc-200">
                Admin → Organizations
              </strong>{" "}
              and click <strong className="text-zinc-200">Configure Pipelines</strong>{" "}
              on the org card.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2 pt-4 border-t border-zinc-800">
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || !token || !locationId}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {saveMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            {savedAt && <CheckCircle2 className="mr-2 h-4 w-4" />}
            {savedAt ? "Saved!" : "Save"}
          </Button>

          <Button
            variant="outline"
            onClick={handleTestConnection}
            disabled={testStatus === "loading" || !token || !locationId}
            className="border-zinc-700"
          >
            {testStatus === "loading" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : testStatus === "success" ? (
              <CheckCircle2 className="mr-2 h-4 w-4 text-emerald-500" />
            ) : testStatus === "error" ? (
              <XCircle className="mr-2 h-4 w-4 text-rose-500" />
            ) : null}
            Test Connection
          </Button>

          <Button
            variant="outline"
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending || !isConnected}
            className="border-zinc-700"
            title="Runs the full sync for every org that has a pipeline configured"
          >
            {syncMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Sync All Orgs
          </Button>
        </div>

        {/* Status messages */}
        {testMessage && (
          <p
            className={`text-sm ${
              testStatus === "success" ? "text-emerald-400" : "text-rose-400"
            }`}
          >
            {testMessage}
          </p>
        )}
        {saveMutation.isError && (
          <p className="text-sm text-rose-400">
            Save failed:{" "}
            {saveMutation.error instanceof Error
              ? saveMutation.error.message
              : "Unknown error"}
          </p>
        )}
        {syncMutation.isSuccess && (
          <p className="text-sm text-emerald-400">
            {(syncMutation.data as { message?: string })?.message ??
              "Sync complete."}
          </p>
        )}
        {syncMutation.isError && (
          <p className="text-sm text-rose-400">
            Sync failed:{" "}
            {syncMutation.error instanceof Error
              ? syncMutation.error.message
              : "Unknown error"}
          </p>
        )}

        {/* Webhook info box */}
        <div className="rounded-lg bg-zinc-800/50 border border-zinc-700/50 p-4 space-y-2 max-w-2xl">
          <p className="text-sm font-medium text-zinc-300">
            Call-Completed Webhook URL
          </p>
          <code className="block text-xs text-muted-foreground bg-zinc-900 rounded px-3 py-2 break-all">
            https://your-domain.vercel.app/api/webhooks/ghl-call
          </code>
          <p className="text-xs text-muted-foreground">
            Add this URL in GHL → Settings → Webhooks → Event: Call Completed.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
