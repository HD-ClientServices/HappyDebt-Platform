"use client";

import { useState } from "react";

const SPACING_TOKENS = [
  { key: "--space-1", label: "Space 1", default: 4 },
  { key: "--space-2", label: "Space 2", default: 8 },
  { key: "--space-3", label: "Space 3", default: 12 },
  { key: "--space-4", label: "Space 4", default: 16 },
  { key: "--space-5", label: "Space 5", default: 20 },
  { key: "--space-6", label: "Space 6", default: 24 },
  { key: "--space-8", label: "Space 8", default: 32 },
  { key: "--space-10", label: "Space 10", default: 40 },
  { key: "--space-12", label: "Space 12", default: 48 },
  { key: "--space-16", label: "Space 16", default: 64 },
];

const RADIUS_TOKENS = [
  { key: "--radius-sm", label: "Small", default: 6, description: "Tags, badges" },
  { key: "--radius-md", label: "Medium", default: 10, description: "Cards, inputs" },
  { key: "--radius-lg", label: "Large", default: 14, description: "Panels, modals" },
  { key: "--radius-xl", label: "Extra Large", default: 20, description: "Large containers" },
];

export function TokenSpacingEditor({
  onApply,
  onSave,
}: {
  onApply: (key: string, value: string) => void;
  onSave: (key: string, value: string, category: string) => Promise<void>;
}) {
  const [pendingChanges, setPendingChanges] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

  const handleChange = (key: string, value: number, category: string) => {
    setPendingChanges((prev) => ({ ...prev, [key]: value }));
    onApply(key, `${value}px`);
  };

  const handleSaveAll = async () => {
    setSaving(true);
    for (const [key, value] of Object.entries(pendingChanges)) {
      const category = key.startsWith("--radius") ? "radius" : "spacing";
      await onSave(key, `${value}px`, category);
    }
    setPendingChanges({});
    setSaving(false);
  };

  const hasPending = Object.keys(pendingChanges).length > 0;

  return (
    <div className="space-y-10">
      {/* Spacing */}
      <div>
        <h4 className="text-xs font-display font-semibold uppercase tracking-widest text-muted-foreground mb-4">
          Spacing Scale
        </h4>
        <div className="space-y-3">
          {SPACING_TOKENS.map((token) => {
            const current = pendingChanges[token.key] ?? token.default;
            return (
              <div key={token.key} className="flex items-center gap-4 p-3 rounded-md border border-border bg-card">
                <code className="text-xs text-muted-foreground font-mono w-24 shrink-0">{token.key}</code>
                <input
                  type="range"
                  min={0}
                  max={96}
                  value={current}
                  onChange={(e) => handleChange(token.key, parseInt(e.target.value), "spacing")}
                  className="flex-1 accent-[var(--color-gold)]"
                />
                <span className="text-sm font-mono text-foreground w-12 text-right">{current}px</span>
                <div
                  className="h-6 bg-primary rounded-sm shrink-0"
                  style={{ width: `${current}px` }}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Border Radius */}
      <div>
        <h4 className="text-xs font-display font-semibold uppercase tracking-widest text-muted-foreground mb-4">
          Border Radius
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {RADIUS_TOKENS.map((token) => {
            const current = pendingChanges[token.key] ?? token.default;
            return (
              <div key={token.key} className="p-4 rounded-md border border-border bg-card space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-foreground">{token.label}</div>
                    <div className="text-xs text-muted-foreground">{token.description}</div>
                  </div>
                  <span className="text-sm font-mono text-foreground">{current}px</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={32}
                  value={current}
                  onChange={(e) => handleChange(token.key, parseInt(e.target.value), "radius")}
                  className="w-full accent-[var(--color-gold)]"
                />
                <div className="flex justify-center">
                  <div
                    className="w-20 h-20 border-2 border-primary bg-muted"
                    style={{ borderRadius: `${current}px` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

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
