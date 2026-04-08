"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Building2, Settings2 } from "lucide-react";
import { OrgConfigDialog } from "./OrgConfigDialog";

export interface OrgRow {
  id: string;
  name: string;
  slug: string;
  plan: string;
  usersCount: number;
  leadsCount: number;
}

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

              <Button
                variant="outline"
                size="sm"
                className="w-full border-zinc-700"
                onClick={() => setEditingOrg(org)}
              >
                <Settings2 className="mr-2 h-3.5 w-3.5" />
                Configure GHL
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {editingOrg && (
        <OrgConfigDialog
          org={editingOrg}
          open={!!editingOrg}
          onClose={() => setEditingOrg(null)}
        />
      )}
    </>
  );
}
