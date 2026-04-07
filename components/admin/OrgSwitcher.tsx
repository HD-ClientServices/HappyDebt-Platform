"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Building2, Check, ChevronDown, LogOut, Search } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useCurrentUserOrg } from "@/hooks/useCurrentUserOrg";
import { useAvailableOrgs } from "@/hooks/useAvailableOrgs";
import { useImpersonationStore } from "@/store/impersonation-store";

export function OrgSwitcher() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: userOrg } = useCurrentUserOrg();
  const { data: orgs, isLoading } = useAvailableOrgs();
  const setImpersonation = useImpersonationStore((s) => s.setImpersonation);
  const clearImpersonation = useImpersonationStore((s) => s.clearImpersonation);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  const isAdmin = userOrg?.isAdmin ?? false;
  const isImpersonating = userOrg?.isImpersonating ?? false;
  const activeOrgId = userOrg?.orgId;

  const filtered = useMemo(() => {
    const list = orgs ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (o) =>
        o.name.toLowerCase().includes(q) ||
        o.slug.toLowerCase().includes(q)
    );
  }, [orgs, search]);

  // Non-admin users never see this component
  if (!isAdmin) return null;

  const handleSelect = (orgId: string, orgName: string) => {
    setImpersonation(orgId, orgName);
    // Force all queries to refetch with the new orgId
    queryClient.invalidateQueries();
    setOpen(false);
    setSearch("");
    router.refresh();
  };

  const handleExit = () => {
    clearImpersonation();
    queryClient.invalidateQueries();
    setOpen(false);
    setSearch("");
    router.refresh();
  };

  const label = isImpersonating
    ? `Viewing: ${userOrg?.impersonatedOrgName ?? "…"}`
    : "Your org";

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        className={cn(
          "flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          isImpersonating
            ? "border-amber-500/50 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
            : "border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
        )}
      >
        <Building2 className="h-4 w-4" />
        <span className="max-w-[160px] truncate">{label}</span>
        <ChevronDown className="h-3.5 w-3.5 opacity-70" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-72 bg-zinc-900 border-zinc-800 p-2"
      >
        <div className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
          Impersonate organization
        </div>
        <div className="relative mb-2">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
          <Input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search orgs…"
            className="h-8 bg-zinc-800 border-zinc-700 pl-7 text-sm"
          />
        </div>

        <div className="max-h-[260px] overflow-y-auto">
          {isLoading && (
            <div className="px-2 py-3 text-xs text-muted-foreground">
              Loading organizations…
            </div>
          )}
          {!isLoading && filtered.length === 0 && (
            <div className="px-2 py-3 text-xs text-muted-foreground">
              No organizations match.
            </div>
          )}
          {!isLoading &&
            filtered.map((org) => {
              const selected = org.id === activeOrgId;
              return (
                <button
                  key={org.id}
                  onClick={() => handleSelect(org.id, org.name)}
                  className={cn(
                    "group flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                    selected
                      ? "bg-zinc-800 text-foreground"
                      : "text-zinc-300 hover:bg-zinc-800/60"
                  )}
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">{org.name}</span>
                    <span className="truncate text-[10px] text-muted-foreground">
                      {org.slug} · {org.plan ?? "—"}
                    </span>
                  </div>
                  {selected && <Check className="h-4 w-4 text-emerald-500" />}
                </button>
              );
            })}
        </div>

        {isImpersonating && (
          <>
            <div className="my-2 border-t border-zinc-800" />
            <button
              onClick={handleExit}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-rose-400 hover:bg-rose-500/10"
            >
              <LogOut className="h-3.5 w-3.5" />
              Exit impersonation
            </button>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
