"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/* ------------------------------------------------------------------ */
/*  Type definitions for health score data                            */
/* ------------------------------------------------------------------ */

export interface HealthFactor {
  label: string;
  met: boolean;
  points: number;
}

export interface UsageBySource {
  happydebt: number;
  clientUpload: number;
}

export interface UsersByRole {
  role: string;
  count: number;
}

export interface OrgHealthData {
  healthScore: number;
  factors: HealthFactor[];
  totalLeads: number;
  leadsBySource: UsageBySource;
  totalCallsAnalyzed: number;
  usersByRole: UsersByRole[];
  lastUserLogin: string | null; // ISO date string
}

/* ------------------------------------------------------------------ */
/*  Health score color utility                                        */
/* ------------------------------------------------------------------ */

function scoreColor(score: number): string {
  if (score >= 75) return "text-green-400";
  if (score >= 50) return "text-yellow-400";
  return "text-red-400";
}

function scoreBg(score: number): string {
  if (score >= 75) return "bg-green-500/10 border-green-500/30";
  if (score >= 50) return "bg-yellow-500/10 border-yellow-500/30";
  return "bg-red-500/10 border-red-500/30";
}

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export default function OrgHealthScore({ data }: { data: OrgHealthData }) {
  return (
    <div className="space-y-6">
      {/* Health Score */}
      <Card className={`border ${scoreBg(data.healthScore)}`}>
        <CardHeader>
          <CardTitle className="font-heading">Health Score</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-baseline gap-3">
            <span
              className={`text-5xl font-bold tabular-nums ${scoreColor(data.healthScore)}`}
            >
              {data.healthScore}
            </span>
            <span className="text-muted-foreground text-lg">/ 100</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {data.factors.map((f) => (
              <div
                key={f.label}
                className="flex items-center justify-between rounded-md bg-zinc-900/60 px-3 py-2 text-sm"
              >
                <span>{f.label}</span>
                {f.met ? (
                  <Badge variant="secondary">+{f.points}</Badge>
                ) : (
                  <Badge variant="destructive">0</Badge>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Usage Metrics */}
      <Card className="bg-zinc-900/80 border-zinc-800">
        <CardHeader>
          <CardTitle className="font-heading">Usage Metrics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Total Leads</p>
              <p className="text-2xl font-bold">{data.totalLeads}</p>
              <p className="text-xs text-muted-foreground mt-1">
                HappyDebt: {data.leadsBySource.happydebt} | Client:{" "}
                {data.leadsBySource.clientUpload}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Calls Analyzed</p>
              <p className="text-2xl font-bold">{data.totalCallsAnalyzed}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Users</p>
              {data.usersByRole.length > 0 ? (
                <ul className="mt-1 space-y-0.5 text-sm">
                  {data.usersByRole.map((u) => (
                    <li key={u.role}>
                      {u.role}: <span className="font-semibold">{u.count}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-2xl font-bold">0</p>
              )}
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Last User Login</p>
              <p className="text-lg font-semibold">
                {data.lastUserLogin
                  ? new Date(data.lastUserLogin).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })
                  : "N/A"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
