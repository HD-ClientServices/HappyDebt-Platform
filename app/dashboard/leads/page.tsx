"use client";

import { useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Upload, Plus, Search } from "lucide-react";
import { LeadsTable } from "./LeadsTable";
import { LeadUploadDialog } from "./LeadUploadDialog";
import { LeadDetailModal } from "./LeadDetailModal";
import type { LeadStatus } from "@/types/database";
import { trackFeatureUsage } from "@/lib/plg";
import { useEffect } from "react";

export default function LeadsPage() {
  const [statusFilter, setStatusFilter] = useState<LeadStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);

  useEffect(() => {
    trackFeatureUsage("leads_page");
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Leads</h1>
          <p className="text-sm text-muted-foreground">
            Manage your leads and track live transfer progress.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={() => setUploadOpen(true)}
          >
            <Upload className="h-4 w-4 mr-2" />
            Bring Your Own Leads
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <Tabs
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as LeadStatus | "all")}
        >
          <TabsList className="bg-zinc-900 border border-zinc-800">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="in_sequence">In Sequence</TabsTrigger>
            <TabsTrigger value="transferred">Transferred</TabsTrigger>
            <TabsTrigger value="closed_won">Closed Won</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search leads..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-zinc-900 border-zinc-800"
          />
        </div>
      </div>

      <LeadsTable
        statusFilter={statusFilter === "all" ? undefined : statusFilter}
        search={search}
        onSelectLead={setSelectedLeadId}
      />

      <LeadUploadDialog open={uploadOpen} onOpenChange={setUploadOpen} />

      <LeadDetailModal
        leadId={selectedLeadId}
        onClose={() => setSelectedLeadId(null)}
      />
    </div>
  );
}
