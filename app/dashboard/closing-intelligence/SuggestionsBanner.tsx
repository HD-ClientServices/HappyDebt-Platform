"use client";

import type React from "react";
import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Search, BarChart3, Microscope, Wrench, Check } from "lucide-react";
import { trackEvent } from "@/lib/plg";

const FALLBACK_SUGGESTIONS: { icon: React.ComponentType<{ className?: string }>; text: string }[] = [
  { icon: Search, text: "Compare sentiment trends between your top and bottom closers this week" },
  { icon: BarChart3, text: "Benchmark your team's avg score against last month's baseline" },
  { icon: Microscope, text: "Deep-dive into calls where sentiment is positive but score is low" },
  { icon: Wrench, text: "Build a custom evaluation template focused on your team's weakest criteria" },
];

export function SuggestionsBanner() {
  const supabase = createClient();
  const [savedIndices, setSavedIndices] = useState<Set<number>>(new Set());
  const [savingIndex, setSavingIndex] = useState<number | null>(null);

  const { data: suggestions } = useQuery({
    queryKey: ["suggestions"],
    queryFn: async () => {
      try {
        const { data } = await supabase.functions.invoke("generate-suggestions", {
          body: {},
        });
        return (data?.suggestions ?? FALLBACK_SUGGESTIONS) as typeof FALLBACK_SUGGESTIONS;
      } catch {
        return FALLBACK_SUGGESTIONS;
      }
    },
    staleTime: 60 * 60 * 1000,
  });

  const list = suggestions ?? FALLBACK_SUGGESTIONS;

  const handleSave = useCallback(
    async (text: string, index: number) => {
      if (savedIndices.has(index)) return;
      setSavingIndex(index);
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;
        const orgId =
          user.user_metadata?.org_id ?? user.app_metadata?.org_id ?? null;

        const { error } = await supabase.from("actionables").insert({
          org_id: orgId,
          user_id: user.id,
          title: text,
          source_type: "suggestion",
          priority: "medium",
          status: "pending",
        });

        if (!error) {
          setSavedIndices((prev) => new Set(prev).add(index));
          trackEvent("actionable_created", { source: "suggestion" });
        }
      } finally {
        setSavingIndex(null);
      }
    },
    [supabase, savedIndices]
  );

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {list.map((s, i) => {
        const Icon = s.icon;
        const isSaved = savedIndices.has(i);
        const isSaving = savingIndex === i;
        return (
          <Card
            key={i}
            className="bg-zinc-900/80 border-zinc-800 flex flex-col"
          >
            <CardContent className="p-4 flex-1 flex flex-col">
              <div className="flex items-start gap-2">
                <Icon className="h-5 w-5 shrink-0 text-emerald-500 mt-0.5" />
                <p className="text-sm text-muted-foreground">{s.text}</p>
              </div>
              <div className="mt-auto pt-2 flex justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={isSaved || isSaving}
                  onClick={() => handleSave(s.text, i)}
                >
                  {isSaved ? (
                    <>
                      <Check className="h-3.5 w-3.5 mr-1" />
                      Saved
                    </>
                  ) : isSaving ? (
                    "Saving..."
                  ) : (
                    "Save as Actionable"
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
