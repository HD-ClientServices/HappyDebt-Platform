"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

interface CurrentUserOrg {
  userId: string;
  orgId: string;
  role: string;
  email: string;
}

/**
 * Returns the current authenticated user's org_id + role.
 * Cached for 5 minutes since these rarely change during a session.
 */
export function useCurrentUserOrg() {
  return useQuery<CurrentUserOrg | null>({
    queryKey: ["current-user-org"],
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

      return {
        userId: user.id,
        orgId: profile.org_id,
        role: profile.role,
        email: user.email ?? "",
      };
    },
    staleTime: 5 * 60 * 1000,
  });
}
