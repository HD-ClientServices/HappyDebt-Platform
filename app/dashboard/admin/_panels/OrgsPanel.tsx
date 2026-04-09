"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Building2, Workflow } from "lucide-react";
import { OrgPipelineDialog } from "./OrgPipelineDialog";

export interface OrgRow {
  id: string;
  name: string;
  slug: string;
  plan: string;
  usersCount: number;
  leadsCount: number;
  /**
   * True if the org has at least an opening pipeline set. Drives the
   * green "Pipelines configured" badge. The server page passes this
   * after joining `organizations` with its own columns.
   */
  hasPipelinesConfigured?: boolean;
}

/**
 * Listing of every organization on the platform, used by the
 * Admin → Organizations tab.
 *
 * Each card exposes a "Configure Pipelines" button that opens
 * `OrgPipelineDialog` — the per-org editor for `ghl_opening_pipeline_id`
 * and `ghl_closing_pipeline_id`. The global GHL credentials (api_token,
 * location_id, reconnect webhook) are NOT edited here — they live in
 * the separate Admin → GHL Integration tab and apply to every org.
 *
 * Orgs that don't have any pipeline set show a muted "Not configured"
 * badge; orgs that do show a green "Configured" badge.
 */
export function OrgsPanel({ orgs }: { orgs: OrgRow[] }) {
  const [editingOrg, setEditingOrg] = useState<OrgRow | null>(null);

  if (orgs.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-700 bg-zinc-900/30 p-12 text-center">
        <Building2 className="h-10 w-10 text-zinc-500 mx-auto mb-4" />
        <p className="text-sm text-muted-foreground">No organizations yet.</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {orgs.map((org) => (
          <Card
            key={org.id}
            className="bg-zinc-900/50 border-zinc-800 hover:border-zinc-700 transition-colors"
          >
            <CardContent className="p-5 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-heading font-semibold truncate">
                    {org.name}
                  </p>
                  <p className="text-xs text-muted-foreground font-mono truncate">
                    {org.slug}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className="text-xs shrink-0 capitalize"
                >
                  {org.plan}
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-zinc-800">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">
                    Users
                  </p>
                  <p className="text-lg font-semibold tabular-nums">
                    {org.usersCount}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">
                    Leads
                  </p>
                  <p className="text-lg font-semibold tabular-nums">
                    {org.leadsCount}
                  </p>
                </div>
              </div>

              <div className="pt-2 border-t border-zinc-800 space-y-2">
                <Badge
                  variant="outline"
                  className={
                    org.hasPipelinesConfigured
                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-[10px]"
                      : "text-[10px] text-muted-foreground"
                  }
                >
                  {org.hasPipelinesConfigured
                    ? "Pipelines configured"
                    : "No pipelines"}
                </Badge>

                <Button
                  variant="outline"
                  size="sm"
                  className="w-full border-zinc-700"
                  onClick={() => setEditingOrg(org)}
                >
                  <Workflow className="mr-2 h-3.5 w-3.5" />
                  Configure Pipelines
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {editingOrg && (
        <OrgPipelineDialog
          org={editingOrg}
          open={!!editingOrg}
          onClose={() => setEditingOrg(null)}
        />
      )}
    </>
  );
}
