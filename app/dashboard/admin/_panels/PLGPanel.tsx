"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export interface OrgRetention {
  id: string;
  name: string;
  daysSinceActivity: number | null;
}

export interface OrgMonetization {
  id: string;
  name: string;
  introLeads: number;
  clientLeads: number;
  transferred: number;
  closedWon: number;
}

export interface PLGData {
  totalOrgs: number;
  newOrgsThisMonth: number;
  orgsWithTemplates: number;
  orgsWithAnalyzedCalls: number;
  orgsWithLeads: number;
  retentionList: OrgRetention[];
  monetizationList: OrgMonetization[];
  totalTransferred: number;
  totalClosedWon: number;
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <Card className="bg-zinc-900/50 border-zinc-800">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-heading font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}

const SUB_TABS = [
  { id: "acquisition", label: "Acquisition" },
  { id: "adoption", label: "Adoption" },
  { id: "retention", label: "Retention" },
  { id: "monetization", label: "Monetization" },
] as const;

type SubTabId = (typeof SUB_TABS)[number]["id"];

export function PLGPanel({ data }: { data: PLGData }) {
  const [activeTab, setActiveTab] = useState<SubTabId>("acquisition");

  return (
    <div className="space-y-4">
      <div className="inline-flex gap-1 rounded-lg bg-zinc-900/50 border border-zinc-800 p-1">
        {SUB_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-all",
              activeTab === tab.id
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-zinc-400 hover:text-white"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "acquisition" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <StatCard label="Total Organizations" value={data.totalOrgs} />
          <StatCard label="New This Month" value={data.newOrgsThisMonth} />
        </div>
      )}

      {activeTab === "adoption" && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard label="Orgs with Templates" value={data.orgsWithTemplates} />
          <StatCard label="Orgs with Analyzed Calls" value={data.orgsWithAnalyzedCalls} />
          <StatCard label="Orgs with Leads" value={data.orgsWithLeads} />
        </div>
      )}

      {activeTab === "retention" && (
        <div>
        <p className="text-sm text-muted-foreground mb-3">
          Organizations sorted by most recent activity.
        </p>
        <div className="rounded-xl border border-zinc-800 overflow-hidden bg-zinc-900/50">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900/80">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Organization</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Days Since Activity</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.retentionList.map((org) => {
                const atRisk = org.daysSinceActivity === null || org.daysSinceActivity > 7;
                return (
                  <tr key={org.id} className="border-t border-zinc-800 hover:bg-zinc-800/30">
                    <td className="px-4 py-2.5 font-medium">{org.name}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                      {org.daysSinceActivity === null ? "Never" : org.daysSinceActivity}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {atRisk ? (
                        <Badge variant="destructive">At Risk</Badge>
                      ) : (
                        <Badge variant="secondary">Active</Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
              {data.retentionList.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">
                    No organizations found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        </div>
      )}

      {activeTab === "monetization" && (
        <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <StatCard label="Total Live Transfers" value={data.totalTransferred} />
          <StatCard label="Total Closed Won" value={data.totalClosedWon} />
        </div>

        <div className="rounded-xl border border-zinc-800 overflow-hidden bg-zinc-900/50">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900/80">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Organization</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Intro</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Client</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Transferred</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">Closed Won</th>
              </tr>
            </thead>
            <tbody>
              {data.monetizationList.map((org) => (
                <tr key={org.id} className="border-t border-zinc-800 hover:bg-zinc-800/30">
                  <td className="px-4 py-2.5 font-medium">{org.name}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{org.introLeads}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{org.clientLeads}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{org.transferred}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{org.closedWon}</td>
                </tr>
              ))}
              {data.monetizationList.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    No lead data found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        </div>
      )}
    </div>
  );
}
