"use client";

import type React from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Search, BarChart3, Microscope, Wrench } from "lucide-react";

const FALLBACK_SUGGESTIONS: { icon: React.ComponentType<{ className?: string }>; text: string }[] = [
  { icon: Search, text: "Compare sentiment trends between your top and bottom closers this week" },
  { icon: BarChart3, text: "Benchmark your team's avg score against last month's baseline" },
  { icon: Microscope, text: "Deep-dive into calls where sentiment is positive but score is low" },
  { icon: Wrench, text: "Build a custom evaluation template focused on your team's weakest criteria" },
];

export function SuggestionsBanner() {
  const supabase = createClient();
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

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {list.map((s, i) => {
        const Icon = s.icon;
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
                <Button variant="ghost" size="sm">
                  Save as Actionable
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
