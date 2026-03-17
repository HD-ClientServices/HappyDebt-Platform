"use client";

import { useQuery } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useCallback } from "react";

interface TokenOverride {
  id: string;
  token_key: string;
  token_value: string;
  theme: "dark" | "light" | "all";
  token_category: string;
}

interface DesignTokenContextValue {
  overrides: TokenOverride[];
  isLoading: boolean;
  applyToken: (key: string, value: string) => void;
  resetToken: (key: string) => void;
  saveToken: (key: string, value: string, category?: string) => Promise<void>;
  deleteToken: (key: string) => Promise<void>;
  refetch: () => void;
}

const DesignTokenContext = createContext<DesignTokenContextValue | null>(null);

export function useDesignTokens() {
  const ctx = useContext(DesignTokenContext);
  if (!ctx) {
    throw new Error("useDesignTokens must be used within DesignTokenProvider");
  }
  return ctx;
}

export function DesignTokenProvider({
  children,
  isAdmin = false,
}: {
  children: React.ReactNode;
  isAdmin?: boolean;
}) {
  // Only fetch overrides if user is admin (the API guards this anyway)
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["design-tokens"],
    queryFn: async () => {
      const res = await fetch("/api/design-tokens");
      if (!res.ok) return { tokens: [] };
      return res.json();
    },
    enabled: isAdmin,
    staleTime: 5 * 60 * 1000,
  });

  const overrides: TokenOverride[] = data?.tokens ?? [];

  // Apply overrides to :root on load and when they change
  useEffect(() => {
    const currentTheme = document.documentElement.getAttribute("data-theme") ?? "dark";
    for (const override of overrides) {
      if (override.theme === "all" || override.theme === currentTheme) {
        document.documentElement.style.setProperty(override.token_key, override.token_value);
      }
    }
  }, [overrides]);

  // Apply a single token live (before saving — for preview)
  const applyToken = useCallback((key: string, value: string) => {
    document.documentElement.style.setProperty(key, value);
  }, []);

  // Reset a single token (remove inline override, revert to CSS default)
  const resetToken = useCallback((key: string) => {
    document.documentElement.style.removeProperty(key);
  }, []);

  // Save a token to the database
  const saveToken = useCallback(
    async (key: string, value: string, category = "color") => {
      await fetch("/api/design-tokens", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token_key: key,
          token_value: value,
          token_category: category,
        }),
      });
      refetch();
    },
    [refetch]
  );

  // Delete a token override (revert to default)
  const deleteToken = useCallback(
    async (key: string) => {
      await fetch(`/api/design-tokens?token_key=${encodeURIComponent(key)}`, {
        method: "DELETE",
      });
      document.documentElement.style.removeProperty(key);
      refetch();
    },
    [refetch]
  );

  return (
    <DesignTokenContext.Provider
      value={{ overrides, isLoading, applyToken, resetToken, saveToken, deleteToken, refetch }}
    >
      {children}
    </DesignTokenContext.Provider>
  );
}
