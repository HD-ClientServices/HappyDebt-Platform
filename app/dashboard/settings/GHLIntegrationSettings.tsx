"use client";

import { useState } from "react";
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
} from "lucide-react";

interface OrgGHLSettings {
  id: string;
  ghl_api_token: string | null;
  ghl_location_id: string | null;
  migration_pending?: boolean;
}

export function GHLIntegrationSettings() {
  const queryClient = useQueryClient();

  const [token, setToken] = useState("");
  const [locationId, setLocationId] = useState("");
  const [testStatus, setTestStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [testMessage, setTestMessage] = useState("");

  // Fetch current org settings via API route (resilient to missing columns)
  const { data: org, isLoading } = useQuery<OrgGHLSettings | null>({
    queryKey: ["org-ghl-settings"],
    queryFn: async () => {
      const res = await fetch("/api/settings/ghl");
      if (!res.ok) {
        if (res.status === 401) return null;
        return null;
      }
      return res.json();
    },
    refetchOnWindowFocus: false,
  });

  // Initialize input fields once data loads
  const hasInitialized = token !== "" || locationId !== "";
  if (org && !hasInitialized) {
    if (org.ghl_api_token) setToken(org.ghl_api_token);
    if (org.ghl_location_id) setLocationId(org.ghl_location_id);
  }

  // Save credentials via API route
  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/settings/ghl", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ghl_api_token: token,
          ghl_location_id: locationId,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Save failed: HTTP ${res.status}`);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org-ghl-settings"] });
    },
  });

  // Test connection — fixed: include locationId as query param
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
        const data = await res.json();
        const count = data.users?.length ?? 0;
        setTestStatus("success");
        setTestMessage(
          `Connected! Found ${count} user(s) in your GHL location.`
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

  // Sync calls
  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/pipeline/sync", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Sync failed: ${res.status}`);
      }
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <Card className="bg-zinc-900/80 border-zinc-800">
        <CardContent className="py-8 text-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mx-auto" />
        </CardContent>
      </Card>
    );
  }

  const isConnected = !!(org?.ghl_api_token && org?.ghl_location_id);
  const migrationPending = org?.migration_pending === true;

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
                Connect your GHL account to analyze live transfer calls
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
                  supabase/migrations/00004_call_pipeline.sql
                </code>{" "}
                in your Supabase SQL Editor to enable GHL settings storage.
              </p>
            </div>
          </div>
        )}

        {/* Credentials */}
        <div className="grid gap-4 max-w-lg">
          <div className="space-y-2">
            <Label htmlFor="ghl-token">GHL API Token</Label>
            <Input
              id="ghl-token"
              type="password"
              placeholder="pit-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="bg-zinc-800 border-zinc-700 font-mono text-sm"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ghl-location">GHL Location ID</Label>
            <Input
              id="ghl-location"
              placeholder="XXXXXXXXXXXXXXXX"
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              className="bg-zinc-800 border-zinc-700 font-mono text-sm"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-3">
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || !token || !locationId}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {saveMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            {saveMutation.isSuccess ? "Saved!" : "Save Credentials"}
          </Button>

          <Button
            variant="outline"
            onClick={handleTestConnection}
            disabled={testStatus === "loading"}
            className="border-zinc-700"
          >
            {testStatus === "loading" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : testStatus === "success" ? (
              <CheckCircle2 className="mr-2 h-4 w-4 text-emerald-500" />
            ) : testStatus === "error" ? (
              <XCircle className="mr-2 h-4 w-4 text-red-500" />
            ) : null}
            Test Connection
          </Button>

          <Button
            variant="outline"
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending || !isConnected}
            className="border-zinc-700"
          >
            {syncMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Sync Calls
          </Button>
        </div>

        {/* Status messages */}
        {testMessage && (
          <p
            className={`text-sm ${
              testStatus === "success" ? "text-emerald-500" : "text-red-400"
            }`}
          >
            {testMessage}
          </p>
        )}
        {saveMutation.isError && (
          <p className="text-sm text-red-400">
            Save failed:{" "}
            {saveMutation.error instanceof Error
              ? saveMutation.error.message
              : "Unknown error"}
          </p>
        )}
        {saveMutation.isSuccess && (
          <p className="text-sm text-emerald-500">Credentials saved!</p>
        )}
        {syncMutation.isSuccess && (
          <div className="text-sm text-emerald-500 space-y-1">
            <p>
              {(syncMutation.data as { message?: string })?.message ?? "Sync complete."}
            </p>
            {((syncMutation.data as { closers_synced?: number })?.closers_synced ?? 0) > 0 && (
              <p className="text-muted-foreground">
                {(syncMutation.data as { closers_synced?: number })?.closers_synced} new closer(s) synced.
              </p>
            )}
            {((syncMutation.data as { calls_discovered?: number })?.calls_discovered ?? 0) > 0 && (
              <p className="text-muted-foreground">
                {(syncMutation.data as { calls_discovered?: number })?.calls_discovered} call(s) found,{" "}
                {(syncMutation.data as { calls_new?: number })?.calls_new ?? 0} new,{" "}
                {(syncMutation.data as { jobs_created?: number })?.jobs_created ?? 0} queued for analysis.
              </p>
            )}
          </div>
        )}
        {syncMutation.isError && (
          <p className="text-sm text-red-400">
            Sync failed:{" "}
            {syncMutation.error instanceof Error
              ? syncMutation.error.message
              : "Unknown error"}
          </p>
        )}

        {/* Webhook info */}
        <div className="rounded-lg bg-zinc-800/50 border border-zinc-700/50 p-4 space-y-2">
          <p className="text-sm font-medium text-zinc-300">Webhook URL</p>
          <code className="block text-xs text-muted-foreground bg-zinc-900 rounded px-3 py-2 break-all">
            https://your-domain.vercel.app/api/webhooks/ghl-call
          </code>
          <p className="text-xs text-muted-foreground">
            Add this URL in GHL → Settings → Webhooks → Event: Call Completed
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
