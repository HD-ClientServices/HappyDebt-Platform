"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export function useLeadCalls(leadId: string | null) {
  const supabase = createClient();

  return useQuery({
    queryKey: ["lead-calls", leadId],
    enabled: !!leadId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("call_recordings")
        .select("*, closers(name)")
        .eq("lead_id", leadId!)
        .order("call_date", { ascending: false });

      if (error) throw error;
      return data ?? [];
    },
  });
}
