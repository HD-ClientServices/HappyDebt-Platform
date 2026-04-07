"use client";

import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";

interface DesignTokens {
  colors?: Record<string, string>;
  typography?: {
    "font-heading"?: string;
    "font-sans"?: string;
  };
  radius?: Record<string, string>;
}

interface DesignTokensResponse {
  tokens: DesignTokens;
  updated_at: string;
}

/**
 * Loads global design tokens from Supabase and applies them as CSS variables
 * on the document root. Components consume them via Tailwind utilities like
 * `bg-primary`, `text-primary-foreground`, etc.
 *
 * Also dynamically loads Google Fonts for the configured typography.
 */
export function DesignTokensProvider({ children }: { children: React.ReactNode }) {
  const fontLinkRef = useRef<HTMLLinkElement | null>(null);

  const { data } = useQuery<DesignTokensResponse>({
    queryKey: ["design-tokens"],
    queryFn: async () => {
      const res = await fetch("/api/design-tokens");
      if (!res.ok) throw new Error("Failed to fetch design tokens");
      return res.json();
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!data?.tokens) return;
    const root = document.documentElement;

    // Colors
    Object.entries(data.tokens.colors || {}).forEach(([key, value]) => {
      root.style.setProperty(`--${key}`, value);
    });

    // Radius
    Object.entries(data.tokens.radius || {}).forEach(([key, value]) => {
      root.style.setProperty(`--radius-${key}`, value);
    });

    // Typography
    const fontHeading = data.tokens.typography?.["font-heading"];
    const fontSans = data.tokens.typography?.["font-sans"];

    if (fontHeading) root.style.setProperty("--font-heading", `"${fontHeading}", sans-serif`);
    if (fontSans) root.style.setProperty("--font-sans", `"${fontSans}", sans-serif`);

    // Dynamically load Google Fonts
    if (fontHeading || fontSans) {
      const families: string[] = [];
      if (fontHeading) families.push(`${fontHeading.replace(/ /g, "+")}:wght@400;500;600;700`);
      if (fontSans && fontSans !== fontHeading) families.push(`${fontSans.replace(/ /g, "+")}:wght@400;500;600`);

      const href = `https://fonts.googleapis.com/css2?family=${families.join("&family=")}&display=swap`;

      // Remove previous dynamic font link if any
      if (fontLinkRef.current) {
        fontLinkRef.current.remove();
      }

      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      link.dataset.designTokens = "true";
      document.head.appendChild(link);
      fontLinkRef.current = link;
    }
  }, [data]);

  return <>{children}</>;
}
