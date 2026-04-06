"use client";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

/* ------------------------------------------------------------------ */
/*  Type definitions for data passed from the server component        */
/* ------------------------------------------------------------------ */

export interface OrgRetention {
  id: string;
  name: string;
  daysSinceActivity: number | null; // null = never active
}

export interface OrgMonetization {
  id: string;
  name: string;
  happydebtLeads: number;
  clientLeads: number;
  transferred: number;
  closedWon: number;
}

export interface PLGData {
  /* Acquisition */
  totalOrgs: number;
  newOrgsThisMonth: number;

  /* Adoption */
  orgsWithTemplates: number;
  orgsWithAnalyzedCalls: number;
  orgsWithLeads: number;

  /* Retention */
  retentionList: OrgRetention[];

  /* Monetization */
  monetizationList: OrgMonetization[];
  totalTransferred: number;
  totalClosedWon: number;
}

/* ------------------------------------------------------------------ */
/*  Small reusable stat card                                          */
/* ------------------------------------------------------------------ */

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <Card className="bg-zinc-900/80 border-zinc-800">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Main PLG dashboard client component                               */
/* ------------------------------------------------------------------ */

export default function PLGDashboard({ data }: { data: PLGData }) {
  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-semibold">PLG Dashboard</h1>

      <Tabs defaultValue="acquisition">
        <TabsList>
          <TabsTrigger value="acquisition">Acquisition</TabsTrigger>
          <TabsTrigger value="adoption">Adoption</TabsTrigger>
          <TabsTrigger value="retention">Retention</TabsTrigger>
          <TabsTrigger value="monetization">Monetization</TabsTrigger>
        </TabsList>

        {/* -------- Acquisition -------- */}
        <TabsContent value="acquisition">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            <StatCard label="Total Organizations" value={data.totalOrgs} />
            <StatCard label="New This Month" value={data.newOrgsThisMonth} />
          </div>
        </TabsContent>

        {/* -------- Adoption -------- */}
        <TabsContent value="adoption">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
            <StatCard
              label="Orgs with Templates"
              value={data.orgsWithTemplates}
            />
            <StatCard
              label="Orgs with Analyzed Calls"
              value={data.orgsWithAnalyzedCalls}
            />
            <StatCard label="Orgs with Leads" value={data.orgsWithLeads} />
          </div>
        </TabsContent>

        {/* -------- Retention -------- */}
        <TabsContent value="retention">
          <div className="mt-4 space-y-2">
            <p className="text-sm text-muted-foreground mb-3">
              Organizations sorted by most recent activity.
            </p>
            <div className="rounded-lg border border-zinc-800 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-zinc-900/60">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">
                      Organization
                    </th>
                    <th className="text-right px-4 py-2 font-medium text-muted-foreground">
                      Days Since Activity
                    </th>
                    <th className="text-right px-4 py-2 font-medium text-muted-foreground">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.retentionList.map((org) => {
                    const atRisk =
                      org.daysSinceActivity === null ||
                      org.daysSinceActivity > 7;
                    return (
                      <tr
                        key={org.id}
                        className="border-t border-zinc-800 hover:bg-zinc-900/40"
                      >
                        <td className="px-4 py-2">
                          <Link
                            href={`/admin/orgs/${org.id}`}
                            className="hover:underline"
                          >
                            {org.name}
                          </Link>
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {org.daysSinceActivity === null
                            ? "Never"
                            : org.daysSinceActivity}
                        </td>
                        <td className="px-4 py-2 text-right">
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
                      <td
                        colSpan={3}
                        className="px-4 py-6 text-center text-muted-foreground"
                      >
                        No organizations found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        {/* -------- Monetization -------- */}
        <TabsContent value="monetization">
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <StatCard
                label="Total Live Transfers"
                value={data.totalTransferred}
              />
              <StatCard label="Total Closed Won" value={data.totalClosedWon} />
            </div>

            <div className="rounded-lg border border-zinc-800 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-zinc-900/60">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">
                      Organization
                    </th>
                    <th className="text-right px-4 py-2 font-medium text-muted-foreground">
                      HappyDebt Leads
                    </th>
                    <th className="text-right px-4 py-2 font-medium text-muted-foreground">
                      Client Leads
                    </th>
                    <th className="text-right px-4 py-2 font-medium text-muted-foreground">
                      Transferred
                    </th>
                    <th className="text-right px-4 py-2 font-medium text-muted-foreground">
                      Closed Won
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.monetizationList.map((org) => (
                    <tr
                      key={org.id}
                      className="border-t border-zinc-800 hover:bg-zinc-900/40"
                    >
                      <td className="px-4 py-2">
                        <Link
                          href={`/admin/orgs/${org.id}`}
                          className="hover:underline"
                        >
                          {org.name}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {org.happydebtLeads}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {org.clientLeads}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {org.transferred}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {org.closedWon}
                      </td>
                    </tr>
                  ))}
                  {data.monetizationList.length === 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-4 py-6 text-center text-muted-foreground"
                      >
                        No lead data found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
