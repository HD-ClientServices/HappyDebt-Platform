"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { AlertTriangle, X } from "lucide-react";
import { useCurrentUserOrg } from "@/hooks/useCurrentUserOrg";
import { useImpersonationStore } from "@/store/impersonation-store";

/**
 * Sticky banner shown at the top of the dashboard whenever the admin is
 * viewing another organization's data. Makes the impersonation obvious
 * so staff don't accidentally edit customer data thinking it's their own.
 */
export function ImpersonationBanner() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: userOrg } = useCurrentUserOrg();
  const clearImpersonation = useImpersonationStore((s) => s.clearImpersonation);

  if (!userOrg?.isImpersonating) return null;

  const handleExit = () => {
    clearImpersonation();
    queryClient.invalidateQueries();
    router.refresh();
  };

  return (
    <div className="flex items-center justify-between gap-4 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-200">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span>
          Viewing as{" "}
          <strong className="text-amber-100">
            {userOrg.impersonatedOrgName}
          </strong>
          {" — all actions you take will affect this organization."}
        </span>
      </div>
      <button
        onClick={handleExit}
        className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-100 transition-colors hover:bg-amber-500/20"
      >
        <X className="h-3 w-3" />
        Exit
      </button>
    </div>
  );
}
