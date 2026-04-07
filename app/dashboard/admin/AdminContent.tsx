"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ArrowLeft, BarChart3, Building2, Palette } from "lucide-react";
import { PLGPanel, type PLGData } from "./_panels/PLGPanel";
import { OrgsPanel, type OrgRow } from "./_panels/OrgsPanel";
import { DesignSystemPanel } from "./_panels/DesignSystemPanel";

interface AdminContentProps {
  plgData: PLGData;
  orgs: OrgRow[];
}

const TABS = [
  { id: "plg", label: "PLG Analytics", icon: BarChart3 },
  { id: "orgs", label: "Organizations", icon: Building2 },
  { id: "design-system", label: "Design System", icon: Palette },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function AdminContent({ plgData, orgs }: AdminContentProps) {
  const [activeTab, setActiveTab] = useState<TabId>("plg");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Admin</h1>
          <p className="text-sm text-muted-foreground">
            Internal tools for Intro staff
          </p>
        </div>
        <Link href="/dashboard/leads">
          <Button variant="outline" size="sm" className="border-zinc-700">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to dashboard
          </Button>
        </Link>
      </div>

      {/* Tab nav */}
      <div className="inline-flex gap-1 rounded-lg bg-zinc-900/50 border border-zinc-800 p-1">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-all",
                activeTab === tab.id
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-zinc-400 hover:text-white"
              )}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === "plg" && <PLGPanel data={plgData} />}
        {activeTab === "orgs" && <OrgsPanel orgs={orgs} />}
        {activeTab === "design-system" && <DesignSystemPanel />}
      </div>
    </div>
  );
}
