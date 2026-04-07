"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { Lead, LeadStatus, LeadSource } from "@/types/database";

export interface LeadWithCloser extends Lead {
  closers: { name: string; avatar_url: string | null } | null;
}

export interface UseLeadsResult {
  leads: LeadWithCloser[];
  total: number;
  hasMore: boolean;
}

interface UseLeadsOptions {
  status?: LeadStatus;
  source?: LeadSource;
  search?: string;
  limit?: number;
  offset?: number;
  /** Explicit org scoping as defense in depth against RLS misconfiguration */
  orgId?: string;
  enabled?: boolean;
}

export function useLeads(options: UseLeadsOptions = {}) {
  const supabase = createClient();
  const {
    status,
    source,
    search,
    limit = 100,
    offset = 0,
    orgId,
    enabled = true,
  } = options;

  return useQuery<UseLeadsResult>({
    queryKey: ["leads", status, source, search, limit, offset, orgId],
    enabled,
    queryFn: async () => {
      let query = supabase
        .from("leads")
        .select("*, closers(name, avatar_url)", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (orgId) query = query.eq("org_id", orgId);
      if (status) query = query.eq("status", status);
      if (source) query = query.eq("source", source);
      if (search) {
        const escaped = search.replace(/,/g, " ").replace(/%/g, "");
        query = query.or(
          `name.ilike.%${escaped}%,business_name.ilike.%${escaped}%,phone.ilike.%${escaped}%,email.ilike.%${escaped}%`
        );
      }

      const { data, count, error } = await query;
      if (error) throw error;

      const leads = (data ?? []) as LeadWithCloser[];
      const total = count ?? 0;
      const hasMore = offset + leads.length < total;

      return { leads, total, hasMore };
    },
  });
}
