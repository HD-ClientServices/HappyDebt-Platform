"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Save, RotateCcw, Palette, Type, Square } from "lucide-react";

interface DesignTokens {
  colors: Record<string, string>;
  typography: {
    "font-heading": string;
    "font-sans": string;
  };
  radius: Record<string, string>;
}

const FONT_OPTIONS = [
  "Space Grotesk", "Inter", "Geist", "Manrope", "IBM Plex Sans",
  "DM Sans", "Plus Jakarta Sans", "Outfit", "Sora", "Figtree",
];

const DEFAULT_TOKENS: DesignTokens = {
  colors: {
    background: "#0a0a0a",
    foreground: "#fafafa",
    card: "#121212",
    border: "#27272a",
    muted: "#27272a",
    "muted-foreground": "#a1a1aa",
    primary: "#10b981",
    "primary-hover": "#059669",
    "primary-foreground": "#ffffff",
  },
  typography: {
    "font-heading": "Space Grotesk",
    "font-sans": "Inter",
  },
  radius: {
    sm: "6px",
    md: "8px",
    lg: "12px",
  },
};

function applyTokensToRoot(tokens: DesignTokens) {
  const root = document.documentElement;
  Object.entries(tokens.colors).forEach(([k, v]) => root.style.setProperty(`--${k}`, v));
  Object.entries(tokens.radius).forEach(([k, v]) => root.style.setProperty(`--radius-${k}`, v));
  if (tokens.typography["font-heading"]) {
    root.style.setProperty("--font-heading", `"${tokens.typography["font-heading"]}", sans-serif`);
  }
  if (tokens.typography["font-sans"]) {
    root.style.setProperty("--font-sans", `"${tokens.typography["font-sans"]}", sans-serif`);
  }
}

function loadGoogleFonts(fontHeading: string, fontSans: string) {
  document.querySelectorAll('link[data-design-tokens="true"]').forEach((el) => el.remove());
  const families: string[] = [];
  if (fontHeading) families.push(`${fontHeading.replace(/ /g, "+")}:wght@400;500;600;700`);
  if (fontSans && fontSans !== fontHeading) families.push(`${fontSans.replace(/ /g, "+")}:wght@400;500;600`);
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${families.join("&family=")}&display=swap`;
  link.dataset.designTokens = "true";
  document.head.appendChild(link);
}

const DS_SUB_TABS = [
  { id: "atoms", label: "Atoms" },
  { id: "molecules", label: "Molecules" },
  { id: "organisms", label: "Organisms" },
] as const;

type DSSubTabId = (typeof DS_SUB_TABS)[number]["id"];

export function DesignSystemPanel() {
  const queryClient = useQueryClient();
  const [tokens, setTokens] = useState<DesignTokens>(DEFAULT_TOKENS);
  const [dirty, setDirty] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<DSSubTabId>("atoms");

  const { data, isLoading } = useQuery({
    queryKey: ["design-tokens"],
    queryFn: async () => {
      const res = await fetch("/api/design-tokens");
      if (!res.ok) {
        // Fall back to defaults silently if the table is not yet provisioned
        return { tokens: DEFAULT_TOKENS };
      }
      return res.json();
    },
    retry: false,
  });

  useEffect(() => {
    if (data?.tokens) {
      const merged = {
        ...DEFAULT_TOKENS,
        ...data.tokens,
        colors: { ...DEFAULT_TOKENS.colors, ...(data.tokens.colors || {}) },
        typography: { ...DEFAULT_TOKENS.typography, ...(data.tokens.typography || {}) },
        radius: { ...DEFAULT_TOKENS.radius, ...(data.tokens.radius || {}) },
      };
      setTokens(merged);
    }
  }, [data]);

  const updateColor = (key: string, value: string) => {
    const next = { ...tokens, colors: { ...tokens.colors, [key]: value } };
    setTokens(next);
    setDirty(true);
    document.documentElement.style.setProperty(`--${key}`, value);
  };

  const updateRadius = (key: string, value: string) => {
    const next = { ...tokens, radius: { ...tokens.radius, [key]: value } };
    setTokens(next);
    setDirty(true);
    document.documentElement.style.setProperty(`--radius-${key}`, value);
  };

  const updateFont = (key: "font-heading" | "font-sans", value: string) => {
    const next = { ...tokens, typography: { ...tokens.typography, [key]: value } };
    setTokens(next);
    setDirty(true);
    document.documentElement.style.setProperty(
      key === "font-heading" ? "--font-heading" : "--font-sans",
      `"${value}", sans-serif`
    );
    loadGoogleFonts(next.typography["font-heading"], next.typography["font-sans"]);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/design-tokens", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tokens }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Save failed");
      }
      return res.json();
    },
    onSuccess: () => {
      setDirty(false);
      queryClient.invalidateQueries({ queryKey: ["design-tokens"] });
    },
  });

  const handleReset = () => {
    setTokens(DEFAULT_TOKENS);
    applyTokensToRoot(DEFAULT_TOKENS);
    loadGoogleFonts(DEFAULT_TOKENS.typography["font-heading"], DEFAULT_TOKENS.typography["font-sans"]);
    setDirty(true);
  };

  if (isLoading) {
    return <div className="p-8 text-muted-foreground">Loading design tokens...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/50 px-5 py-4">
        <div>
          <h2 className="font-heading text-base font-semibold">Edit design tokens</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Changes apply globally across the platform on save.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleReset} className="border-zinc-700">
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset to defaults
          </Button>
          <Button
            size="sm"
            onClick={() => saveMutation.mutate()}
            disabled={!dirty || saveMutation.isPending}
            className="bg-primary hover:bg-primary-hover text-primary-foreground"
          >
            <Save className="h-4 w-4 mr-2" />
            {saveMutation.isPending ? "Saving..." : dirty ? "Save Changes" : "Saved"}
          </Button>
        </div>
      </div>

      {saveMutation.isError && (
        <div className="rounded-lg border border-red-900/50 bg-red-950/30 p-3 text-sm text-red-400">
          {(saveMutation.error as Error).message}
        </div>
      )}

      <div className="inline-flex gap-1 rounded-lg bg-zinc-900/50 border border-zinc-800 p-1">
        {DS_SUB_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-all",
              activeSubTab === tab.id
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-zinc-400 hover:text-white"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeSubTab === "atoms" && (
        <div className="space-y-6">
          {/* Colors */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Palette className="h-4 w-4" />
                Colors
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Object.entries(tokens.colors).map(([key, value]) => (
                  <div key={key} className="flex items-center gap-3">
                    <div
                      className="h-10 w-10 rounded-md border border-zinc-700 shrink-0"
                      style={{ backgroundColor: value }}
                    />
                    <div className="flex-1 min-w-0">
                      <label className="text-xs text-muted-foreground font-mono">--{key}</label>
                      <div className="flex gap-2 mt-1">
                        <Input
                          type="color"
                          value={value}
                          onChange={(e) => updateColor(key, e.target.value)}
                          className="h-8 w-12 p-1 bg-zinc-900 border-zinc-800 cursor-pointer"
                        />
                        <Input
                          type="text"
                          value={value}
                          onChange={(e) => updateColor(key, e.target.value)}
                          className="h-8 bg-zinc-900 border-zinc-800 font-mono text-xs"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Typography */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Type className="h-4 w-4" />
                Typography
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-xs text-muted-foreground font-mono">--font-heading</label>
                <select
                  value={tokens.typography["font-heading"]}
                  onChange={(e) => updateFont("font-heading", e.target.value)}
                  className="mt-1 h-9 w-full rounded-md bg-zinc-900 border border-zinc-800 px-3 text-sm"
                >
                  {FONT_OPTIONS.map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
                <p className="font-heading text-2xl mt-3" style={{ fontFamily: `"${tokens.typography["font-heading"]}", sans-serif` }}>
                  Heading preview — The quick brown fox
                </p>
              </div>

              <div>
                <label className="text-xs text-muted-foreground font-mono">--font-sans</label>
                <select
                  value={tokens.typography["font-sans"]}
                  onChange={(e) => updateFont("font-sans", e.target.value)}
                  className="mt-1 h-9 w-full rounded-md bg-zinc-900 border border-zinc-800 px-3 text-sm"
                >
                  {FONT_OPTIONS.map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
                <p className="text-sm mt-3" style={{ fontFamily: `"${tokens.typography["font-sans"]}", sans-serif` }}>
                  Body preview — The quick brown fox jumps over the lazy dog. Lorem ipsum dolor sit amet.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Radius */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Square className="h-4 w-4" />
                Border Radius
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {Object.entries(tokens.radius).map(([key, value]) => (
                <div key={key} className="flex items-center gap-3">
                  <div
                    className="h-10 w-10 bg-primary border border-zinc-700 shrink-0"
                    style={{ borderRadius: value }}
                  />
                  <div className="flex-1">
                    <label className="text-xs text-muted-foreground font-mono">--radius-{key}</label>
                    <Input
                      type="text"
                      value={value}
                      onChange={(e) => updateRadius(key, e.target.value)}
                      className="h-8 bg-zinc-900 border-zinc-800 font-mono text-xs mt-1"
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {activeSubTab === "molecules" && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Buttons</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <Button className="bg-primary hover:bg-primary-hover text-primary-foreground">
                Primary Button
              </Button>
              <Button variant="outline" className="border-zinc-700">
                Secondary Outline
              </Button>
              <Button variant="ghost">Ghost</Button>
              <Button disabled className="bg-primary text-primary-foreground">
                Disabled
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Inputs</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 max-w-md">
              <Input placeholder="Default input" className="bg-zinc-900 border-zinc-800" />
              <Input placeholder="With value" defaultValue="Hello world" className="bg-zinc-900 border-zinc-800" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Badges</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Badge>Default</Badge>
              <Badge variant="secondary">Secondary</Badge>
              <Badge variant="outline">Outline</Badge>
              <Badge variant="destructive">Destructive</Badge>
            </CardContent>
          </Card>
        </div>
      )}

      {activeSubTab === "organisms" && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Stat Card</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                {[
                  { title: "Total Leads", value: "1,234" },
                  { title: "Live Transfers", value: "456" },
                  { title: "Closing Rate", value: "37%" },
                ].map((stat) => (
                  <div key={stat.title} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
                    <p className="text-xs text-muted-foreground">{stat.title}</p>
                    <p className="font-heading text-2xl font-semibold mt-1">{stat.value}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Empty State</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-xl border border-dashed border-zinc-700 bg-zinc-900/30 p-8 text-center">
                <h3 className="font-heading text-lg font-medium mb-2">Empty State Title</h3>
                <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
                  This is how empty states look across the platform with the current tokens.
                </p>
                <Button className="bg-primary hover:bg-primary-hover text-primary-foreground">
                  Primary Action
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
