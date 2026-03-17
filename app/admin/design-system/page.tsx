"use client";

import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Palette, Ruler, Component, Type, RotateCcw } from "lucide-react";
import { TokenColorEditor } from "./_components/TokenColorEditor";
import { TokenSpacingEditor } from "./_components/TokenSpacingEditor";
import { ComponentPreview } from "./_components/ComponentPreview";
import { ThemeToggle } from "@/components/shared/ThemeToggle";

type Section = "colors" | "spacing" | "typography" | "components";

const NAV_ITEMS: { id: Section; label: string; icon: typeof Palette; group: string }[] = [
  { id: "colors", label: "Colors", icon: Palette, group: "Atoms" },
  { id: "typography", label: "Typography", icon: Type, group: "Atoms" },
  { id: "spacing", label: "Spacing & Radius", icon: Ruler, group: "Atoms" },
  { id: "components", label: "Components", icon: Component, group: "Molecules" },
];

export default function DesignSystemEditor() {
  const [activeSection, setActiveSection] = useState<Section>("colors");

  // Fetch existing overrides
  const { data, refetch } = useQuery({
    queryKey: ["design-tokens"],
    queryFn: async () => {
      const res = await fetch("/api/design-tokens");
      if (!res.ok) return { tokens: [] };
      return res.json();
    },
  });

  // Apply saved overrides on load
  useEffect(() => {
    if (data?.tokens) {
      for (const t of data.tokens) {
        document.documentElement.style.setProperty(t.token_key, t.token_value);
      }
    }
  }, [data]);

  // Live preview: apply token without saving
  const applyToken = useCallback((key: string, value: string) => {
    document.documentElement.style.setProperty(key, value);
  }, []);

  // Reset a token (remove inline override)
  const resetToken = useCallback(
    async (key: string) => {
      document.documentElement.style.removeProperty(key);
      // Also delete from DB if it exists
      await fetch(`/api/design-tokens?token_key=${encodeURIComponent(key)}`, {
        method: "DELETE",
      });
      refetch();
    },
    [refetch]
  );

  // Save token to DB
  const saveToken = useCallback(
    async (key: string, value: string, category: string) => {
      await fetch("/api/design-tokens", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token_key: key, token_value: value, token_category: category }),
      });
      refetch();
    },
    [refetch]
  );

  // Reset ALL overrides
  const resetAll = useCallback(async () => {
    if (data?.tokens) {
      for (const t of data.tokens) {
        document.documentElement.style.removeProperty(t.token_key);
        await fetch(`/api/design-tokens?id=${t.id}`, { method: "DELETE" });
      }
      refetch();
    }
  }, [data, refetch]);

  // Group nav items
  const groups = NAV_ITEMS.reduce(
    (acc, item) => {
      if (!acc[item.group]) acc[item.group] = [];
      acc[item.group].push(item);
      return acc;
    },
    {} as Record<string, typeof NAV_ITEMS>
  );

  return (
    <div className="flex min-h-[calc(100vh-80px)] -m-6">
      {/* Sidebar */}
      <aside className="w-60 shrink-0 border-r border-border bg-card p-4 flex flex-col">
        <div className="mb-6">
          <h1 className="text-lg font-display font-bold text-foreground">Design System</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Edit tokens, preview changes live
          </p>
        </div>

        <nav className="flex-1 space-y-6">
          {Object.entries(groups).map(([group, items]) => (
            <div key={group}>
              <div className="text-[9px] font-display font-semibold text-muted-foreground uppercase tracking-[1.5px] mb-2 px-2">
                {group}
              </div>
              <div className="space-y-0.5">
                {items.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeSection === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setActiveSection(item.id)}
                      className={`flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded-md transition-colors ${
                        isActive
                          ? "bg-gold-subtle text-foreground border-l-2 border-gold"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted"
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="mt-auto pt-4 border-t border-border space-y-3">
          <ThemeToggle />
          <button
            onClick={resetAll}
            className="flex items-center gap-2 w-full px-2 py-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors rounded-md"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset all to defaults
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto p-8">
        <div className="max-w-4xl">
          {activeSection === "colors" && (
            <>
              <div className="mb-8">
                <h2 className="text-2xl font-display font-bold text-foreground">Colors</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Click any swatch to open the color picker. Changes preview instantly.
                </p>
              </div>
              <TokenColorEditor onApply={applyToken} onSave={saveToken} onReset={resetToken} />
            </>
          )}

          {activeSection === "typography" && (
            <>
              <div className="mb-8">
                <h2 className="text-2xl font-display font-bold text-foreground">Typography</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Type scale preview with the current font configuration.
                </p>
              </div>
              <div className="space-y-6 p-6 rounded-md border border-border bg-card">
                <div>
                  <div className="text-[9px] text-muted-foreground uppercase tracking-[1.5px] mb-1">text-4xl / Syne 700 / 48px</div>
                  <p className="text-5xl font-display font-bold tracking-tight">We make the intro.</p>
                </div>
                <hr className="border-border" />
                <div>
                  <div className="text-[9px] text-muted-foreground uppercase tracking-[1.5px] mb-1">text-3xl / Syne 700 / 32px</div>
                  <p className="text-3xl font-display font-bold">Hero numbers & KPIs</p>
                </div>
                <hr className="border-border" />
                <div>
                  <div className="text-[9px] text-muted-foreground uppercase tracking-[1.5px] mb-1">text-2xl / Syne 700 / 24px</div>
                  <p className="text-2xl font-display font-bold">Section Headers</p>
                </div>
                <hr className="border-border" />
                <div>
                  <div className="text-[9px] text-muted-foreground uppercase tracking-[1.5px] mb-1">text-xl / Syne 700 / 18px</div>
                  <p className="text-xl font-display font-bold">Page Titles</p>
                </div>
                <hr className="border-border" />
                <div>
                  <div className="text-[9px] text-muted-foreground uppercase tracking-[1.5px] mb-1">text-lg / DM Sans 500 / 16px</div>
                  <p className="text-lg font-body font-medium">Body emphasis text</p>
                </div>
                <hr className="border-border" />
                <div>
                  <div className="text-[9px] text-muted-foreground uppercase tracking-[1.5px] mb-1">text-md / DM Sans 400 / 13px</div>
                  <p className="text-[13px] font-body">Standard body text for paragraphs and UI elements</p>
                </div>
                <hr className="border-border" />
                <div>
                  <div className="text-[9px] text-muted-foreground uppercase tracking-[1.5px] mb-1">text-sm / DM Sans 400 / 11px</div>
                  <p className="text-[11px] font-body">Captions and secondary information</p>
                </div>
                <hr className="border-border" />
                <div>
                  <div className="text-[9px] text-muted-foreground uppercase tracking-[1.5px] mb-1">text-xs / DM Sans 300 / 9px / uppercase / tracking 1.5px</div>
                  <p className="text-[9px] font-body font-light uppercase tracking-[1.5px]">Labels and meta information</p>
                </div>
              </div>

              <div className="mt-8 space-y-4">
                <h4 className="text-xs font-display font-semibold uppercase tracking-widest text-muted-foreground">
                  Font Families
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 rounded-md border border-border bg-card">
                    <div className="text-xs text-muted-foreground uppercase tracking-widest mb-2">Display / Headings</div>
                    <p className="text-2xl font-display font-bold">Syne</p>
                    <p className="text-xs text-muted-foreground mt-1">Weights: 600, 700, 800</p>
                  </div>
                  <div className="p-4 rounded-md border border-border bg-card">
                    <div className="text-xs text-muted-foreground uppercase tracking-widest mb-2">Body / UI</div>
                    <p className="text-2xl font-body">DM Sans</p>
                    <p className="text-xs text-muted-foreground mt-1">Weights: 300, 400, 500</p>
                  </div>
                </div>
              </div>
            </>
          )}

          {activeSection === "spacing" && (
            <>
              <div className="mb-8">
                <h2 className="text-2xl font-display font-bold text-foreground">Spacing & Radius</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Adjust the spacing scale and border radius tokens.
                </p>
              </div>
              <TokenSpacingEditor onApply={applyToken} onSave={saveToken} />
            </>
          )}

          {activeSection === "components" && (
            <>
              <div className="mb-8">
                <h2 className="text-2xl font-display font-bold text-foreground">Components</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Live preview of all components using current design tokens.
                </p>
              </div>
              <ComponentPreview />
            </>
          )}
        </div>
      </main>
    </div>
  );
}
