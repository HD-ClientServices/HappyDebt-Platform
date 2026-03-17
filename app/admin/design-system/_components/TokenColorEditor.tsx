"use client";

import { useState, useCallback } from "react";
import { RotateCcw } from "lucide-react";

interface ColorToken {
  key: string;
  label: string;
  description: string;
}

const COLOR_GROUPS: { title: string; tokens: ColorToken[] }[] = [
  {
    title: "Backgrounds",
    tokens: [
      { key: "--color-bg", label: "Background", description: "Main page background" },
      { key: "--color-surface", label: "Surface", description: "Cards, panels" },
      { key: "--color-elevated", label: "Elevated", description: "Hover states, borders" },
    ],
  },
  {
    title: "Text",
    tokens: [
      { key: "--color-text-primary", label: "Primary", description: "Main text" },
      { key: "--color-text-secondary", label: "Secondary", description: "Subdued text" },
      { key: "--color-text-muted", label: "Muted", description: "Disabled, hints" },
    ],
  },
  {
    title: "Gold Accent",
    tokens: [
      { key: "--color-gold", label: "Gold", description: "Primary accent" },
      { key: "--color-gold-dark", label: "Gold Dark", description: "Gold on light backgrounds" },
    ],
  },
  {
    title: "Status",
    tokens: [
      { key: "--color-success", label: "Success", description: "Positive indicators" },
      { key: "--color-danger", label: "Danger", description: "Errors, destructive" },
      { key: "--color-warning", label: "Warning", description: "Caution states" },
    ],
  },
];

export function TokenColorEditor({
  onApply,
  onSave,
  onReset,
}: {
  onApply: (key: string, value: string) => void;
  onSave: (key: string, value: string, category: string) => Promise<void>;
  onReset: (key: string) => void;
}) {
  const [pendingChanges, setPendingChanges] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const getCurrentValue = useCallback((key: string) => {
    return getComputedStyle(document.documentElement).getPropertyValue(key).trim();
  }, []);

  const handleColorChange = (key: string, value: string) => {
    setPendingChanges((prev) => ({ ...prev, [key]: value }));
    onApply(key, value);
  };

  const handleSaveAll = async () => {
    setSaving(true);
    for (const [key, value] of Object.entries(pendingChanges)) {
      await onSave(key, value, "color");
    }
    setPendingChanges({});
    setSaving(false);
  };

  const handleResetToken = (key: string) => {
    setPendingChanges((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    onReset(key);
  };

  const hasPending = Object.keys(pendingChanges).length > 0;

  return (
    <div className="space-y-8">
      {COLOR_GROUPS.map((group) => (
        <div key={group.title}>
          <h4 className="text-xs font-display font-semibold uppercase tracking-widest text-muted-foreground mb-4">
            {group.title}
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {group.tokens.map((token) => {
              const current = pendingChanges[token.key] || getCurrentValue(token.key);
              return (
                <div
                  key={token.key}
                  className="flex items-center gap-3 p-3 rounded-md border border-border bg-card"
                >
                  <label className="relative shrink-0 cursor-pointer">
                    <div
                      className="w-10 h-10 rounded-md border border-border"
                      style={{ backgroundColor: current }}
                    />
                    <input
                      type="color"
                      value={current || "#000000"}
                      onChange={(e) => handleColorChange(token.key, e.target.value)}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                  </label>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground">{token.label}</div>
                    <div className="text-xs text-muted-foreground truncate">{token.description}</div>
                    <code className="text-[10px] text-muted-foreground font-mono">{current}</code>
                  </div>
                  <button
                    onClick={() => handleResetToken(token.key)}
                    className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
                    title="Reset to default"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {hasPending && (
        <div className="sticky bottom-4 flex justify-end">
          <button
            onClick={handleSaveAll}
            disabled={saving}
            className="px-5 py-2 bg-primary text-primary-foreground font-display font-semibold text-sm rounded-md transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Saving..." : `Save ${Object.keys(pendingChanges).length} change${Object.keys(pendingChanges).length > 1 ? "s" : ""}`}
          </button>
        </div>
      )}
    </div>
  );
}
