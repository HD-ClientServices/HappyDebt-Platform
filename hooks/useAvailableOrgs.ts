"use client";

import { useQuery } from "@tanstack/react-query";
import { useCurrentUserOrg } from "./useCurrentUserOrg";

export interface AvailableOrg {
  id: string;
  name: string;
  slug: string;
  plan: string | null;
}

/**
 * Fetches the list of all organizations visible to the current admin user.
 * Returns an empty array for non-admin users (the API route rejects them
 * with 403, but we short-circuit on the client to avoid the request).
 */
export function useAvailableOrgs() {
  const { data: userOrg } = useCurrentUserOrg();
  const isAdmin = userOrg?.isAdmin ?? false;

  return useQuery<AvailableOrg[]>({
    queryKey: ["admin-available-orgs"],
    enabled: isAdmin,
    queryFn: async () => {
      const res = await fetch("/api/admin/orgs");
      if (!res.ok) {
        return [];
      }
      const body = await res.json();
      return body.orgs ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });
}
