"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { Lead, LeadStatus, LeadSource } from "@/types/database";

interface UseLeadsOptions {
  status?: LeadStatus;
  source?: LeadSource;
  search?: string;
  limit?: number;
}

export function useLeads(options: UseLeadsOptions = {}) {
  const supabase = createClient();
  const { status, source, search, limit = 100 } = options;

  return useQuery({
    queryKey: ["leads", status, source, search, limit],
    queryFn: async () => {
      let query = supabase
        .from("leads")
        .select("*, closers(name, avatar_url)", { count: "exact" })
        .order("created_at", { ascending: false })
        .limit(limit);

      if (status) query = query.eq("status", status);
      if (source) query = query.eq("source", source);
      if (search) query = query.or(`name.ilike.%${search}%,business_name.ilike.%${search}%`);

      const { data, count, error } = await query;
      if (error) throw error;
      return { leads: data ?? [], total: count ?? 0 };
    },
  });
}
