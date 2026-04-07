"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

interface UploadLead {
  name: string;
  phone?: string;
  email?: string;
  business_name?: string;
}

export function useLeadUpload() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (leads: UploadLead[]) => {
      const res = await fetch("/api/leads/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leads }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Upload failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["happydebt-transfers-count"] });
    },
  });
}
