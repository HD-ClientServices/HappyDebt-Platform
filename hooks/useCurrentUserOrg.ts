"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useImpersonationStore } from "@/store/impersonation-store";

interface CurrentUserOrg {
  userId: string;
  /** The effective org id — either the user's real org or the impersonated one for admins. */
  orgId: string;
  /** The user's own org id (never affected by impersonation). */
  realOrgId: string;
  role: string;
  email: string;
  /** True if the user is staff (email ends in @happydebt.com or @tryintro.com). */
  isAdmin: boolean;
  /** True if the admin is currently viewing another org. */
  isImpersonating: boolean;
  impersonatedOrgName: string | null;
}

function isStaffEmail(email: string): boolean {
  const lower = email.toLowerCase();
  return lower.endsWith("@happydebt.com") || lower.endsWith("@tryintro.com");
}

/**
 * Returns the current authenticated user's org_id + role.
 *
 * For staff users with an active impersonation, returns the impersonated
 * org_id as `orgId` while keeping `realOrgId` as the actual user's org.
 *
 * The user's profile is cached for 5 minutes. The impersonation store is
 * read on every call via subscribe to keep the effective orgId reactive.
 */
export function useCurrentUserOrg() {
  const impersonatedOrgId = useImpersonationStore((s) => s.impersonatedOrgId);
  const impersonatedOrgName = useImpersonationStore((s) => s.impersonatedOrgName);

  return useQuery<CurrentUserOrg | null>({
    queryKey: ["current-user-org", impersonatedOrgId],
    queryFn: async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return null;

      const { data: profile } = await supabase
        .from("users")
        .select("org_id, role")
        .eq("id", user.id)
        .single();

      if (!profile) return null;

      const email = user.email ?? "";
      const isAdmin = isStaffEmail(email);
      const canImpersonate = isAdmin && !!impersonatedOrgId;

      return {
        userId: user.id,
        orgId: canImpersonate ? impersonatedOrgId : profile.org_id,
        realOrgId: profile.org_id,
        role: profile.role,
        email,
        isAdmin,
        isImpersonating: canImpersonate,
        impersonatedOrgName: canImpersonate ? impersonatedOrgName : null,
      };
    },
    staleTime: 5 * 60 * 1000,
  });
}
