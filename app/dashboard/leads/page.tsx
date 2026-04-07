"use client";

import { useState, useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Upload, Search, RefreshCw, Download } from "lucide-react";
import { LeadsTable } from "./LeadsTable";
import { LeadUploadDialog } from "./LeadUploadDialog";
import { LeadDetailModal } from "./LeadDetailModal";
import type { LeadStatus } from "@/types/database";
import { trackFeatureUsage } from "@/lib/plg";
import { useDebounce } from "@/hooks/useDebounce";
import { useCurrentUserOrg } from "@/hooks/useCurrentUserOrg";
import { useLeads } from "@/hooks/useLeads";
import { exportToCSV } from "@/lib/csv-export";

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function LeadsPage() {
  const [statusFilter, setStatusFilter] = useState<LeadStatus | "all">("all");
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebounce(searchInput, 300);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [nowTick, setNowTick] = useState(0);

  const queryClient = useQueryClient();
  const { data: userOrg } = useCurrentUserOrg();

  // Query to feed the export action (reads from cache populated by LeadsTable)
  const { data: leadsData } = useLeads({
    source: "client_upload",
    status: statusFilter === "all" ? undefined : statusFilter,
    search: debouncedSearch,
    limit: 100,
    orgId: userOrg?.orgId,
    enabled: !!userOrg?.orgId,
  });

  useEffect(() => {
    trackFeatureUsage("leads_page");
  }, []);

  // Tick every 15s so "updated X ago" stays fresh
  useEffect(() => {
    const t = setInterval(() => setNowTick((n) => n + 1), 15_000);
    return () => clearInterval(t);
  }, []);

  // Refresh the last-updated stamp whenever a new fetch succeeds.
  useEffect(() => {
    if (leadsData) setLastUpdated(new Date());
  }, [leadsData]);

  const timeAgo = useMemo(() => formatTimeAgo(lastUpdated), [lastUpdated, nowTick]);

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["leads"] });
    queryClient.invalidateQueries({ queryKey: ["intro-transfers-count"] });
    setLastUpdated(new Date());
  };

  const handleExport = () => {
    const leads = leadsData?.leads ?? [];
    if (leads.length === 0) return;

    const rows = leads.map((lead) => ({
      Name: lead.name,
      Business: lead.business_name ?? "",
      Phone: lead.phone ?? "",
      Email: lead.email ?? "",
      Closer: lead.closers?.name ?? "",
      Status: lead.status,
      Date: new Date(lead.created_at).toISOString().slice(0, 10),
    }));

    const stamp = new Date().toISOString().slice(0, 10);
    exportToCSV(rows, `leads-${stamp}.csv`);
  };

  const totalLeads = leadsData?.leads.length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Leads</h1>
          <p className="text-sm text-muted-foreground">
            Manage your leads and track live transfer progress.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground hidden sm:inline">
            Updated {timeAgo}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            className="border-zinc-700 h-[38px]"
            aria-label="Refresh leads"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={totalLeads === 0}
            className="border-zinc-700 h-[38px]"
            aria-label="Export leads to CSV"
          >
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div
          className="inline-flex gap-1 rounded-lg bg-zinc-900/50 border border-zinc-800 p-1"
          role="tablist"
          aria-label="Filter leads by status"
        >
          {([
            { value: "all", label: "All" },
            { value: "in_sequence", label: "In Sequence" },
            { value: "transferred", label: "Transferred" },
            { value: "closed_won", label: "Closed Won" },
          ] as const).map((tab) => {
            const active = statusFilter === tab.value;
            return (
              <button
                key={tab.value}
                role="tab"
                aria-selected={active}
                aria-pressed={active}
                aria-label={`Filter by ${tab.label}`}
                onClick={() => setStatusFilter(tab.value)}
                className={cn(
                  "rounded-md px-3 py-1 text-sm font-medium transition-all",
                  active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-zinc-400 hover:text-white"
                )}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search by name, business, phone, email..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9 h-[38px] bg-zinc-900 border-zinc-800"
            aria-label="Search leads"
          />
        </div>
        <Button
          onClick={() => setUploadOpen(true)}
          className="bg-primary hover:bg-primary-hover text-primary-foreground font-semibold h-[38px] px-5 text-sm shadow-lg shadow-primary/25"
        >
          <Upload className="h-4 w-4 mr-2" />
          Bring Your Own Leads
        </Button>
      </div>

      <LeadsTable
        statusFilter={statusFilter === "all" ? undefined : statusFilter}
        search={debouncedSearch}
        onSelectLead={setSelectedLeadId}
        onUploadClick={() => setUploadOpen(true)}
      />

      <LeadUploadDialog open={uploadOpen} onOpenChange={setUploadOpen} />

      <LeadDetailModal
        leadId={selectedLeadId}
        onClose={() => setSelectedLeadId(null)}
      />
    </div>
  );
}
