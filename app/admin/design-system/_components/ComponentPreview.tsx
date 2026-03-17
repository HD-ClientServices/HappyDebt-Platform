"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export function ComponentPreview() {
  return (
    <div className="space-y-10">
      {/* Buttons */}
      <div>
        <h4 className="text-xs font-display font-semibold uppercase tracking-widest text-muted-foreground mb-4">
          Buttons
        </h4>
        <div className="flex flex-wrap gap-3 p-6 rounded-md border border-border bg-card">
          <Button>Primary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
        </div>
      </div>

      {/* Badges */}
      <div>
        <h4 className="text-xs font-display font-semibold uppercase tracking-widest text-muted-foreground mb-4">
          Badges / Tags
        </h4>
        <div className="flex flex-wrap gap-3 p-6 rounded-md border border-border bg-card">
          <Badge>Default</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="outline">Outline</Badge>
          <span className="inline-flex items-center px-2 py-0.5 bg-gold-subtle text-gold text-xs font-medium rounded-sm">
            Gold Tag
          </span>
          <span className="inline-flex items-center px-2 py-0.5 bg-[var(--color-success-subtle)] text-success text-xs font-medium rounded-sm">
            Success
          </span>
          <span className="inline-flex items-center px-2 py-0.5 bg-[var(--color-danger-subtle)] text-destructive text-xs font-medium rounded-sm">
            Danger
          </span>
        </div>
      </div>

      {/* Inputs */}
      <div>
        <h4 className="text-xs font-display font-semibold uppercase tracking-widest text-muted-foreground mb-4">
          Inputs
        </h4>
        <div className="max-w-md space-y-3 p-6 rounded-md border border-border bg-card">
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-widest block mb-1">
              Label
            </label>
            <Input placeholder="Type something..." />
          </div>
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-widest block mb-1">
              Disabled
            </label>
            <Input placeholder="Disabled" disabled />
          </div>
        </div>
      </div>

      {/* Cards */}
      <div>
        <h4 className="text-xs font-display font-semibold uppercase tracking-widest text-muted-foreground mb-4">
          Cards
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs text-muted-foreground uppercase tracking-widest font-body font-light">
                Total Leads
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-display font-bold">1,284</div>
              <div className="text-xs text-success mt-1">+12.5%</div>
            </CardContent>
          </Card>

          <Card className="border-gold-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs text-muted-foreground uppercase tracking-widest font-body font-light">
                Closing Rate
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-display font-bold text-gold">34.2%</div>
              <div className="text-xs text-success mt-1">+2.1pp</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs text-muted-foreground uppercase tracking-widest font-body font-light">
                Revenue
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-display font-bold">$42.8K</div>
              <div className="text-xs text-destructive mt-1">-3.2%</div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Table */}
      <div>
        <h4 className="text-xs font-display font-semibold uppercase tracking-widest text-muted-foreground mb-4">
          Table
        </h4>
        <div className="rounded-md border border-border overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-muted">
                <th className="text-left px-4 py-2 text-xs text-muted-foreground uppercase tracking-widest font-body font-light">Name</th>
                <th className="text-left px-4 py-2 text-xs text-muted-foreground uppercase tracking-widest font-body font-light">Status</th>
                <th className="text-right px-4 py-2 text-xs text-muted-foreground uppercase tracking-widest font-body font-light">Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              <tr className="hover:bg-muted/50 transition-colors">
                <td className="px-4 py-3 text-sm text-foreground">Maria Gonzalez</td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center px-2 py-0.5 bg-gold-subtle text-gold text-xs font-medium rounded-sm">Active</span>
                </td>
                <td className="px-4 py-3 text-sm text-right font-mono text-foreground">92</td>
              </tr>
              <tr className="hover:bg-muted/50 transition-colors">
                <td className="px-4 py-3 text-sm text-foreground">James Park</td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center px-2 py-0.5 bg-muted text-muted-foreground text-xs font-medium rounded-sm">Pending</span>
                </td>
                <td className="px-4 py-3 text-sm text-right font-mono text-foreground">78</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
