"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUserOrg } from "./useCurrentUserOrg";

export function useClosers() {
  const supabase = createClient();
  const { data: userOrg } = useCurrentUserOrg();
  const orgId = userOrg?.orgId;
  return useQuery({
    queryKey: ["closers", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from("closers")
        .select("id, name")
        .eq("org_id", orgId!);
      return data ?? [];
    },
    staleTime: 10 * 60 * 1000,
  });
}
