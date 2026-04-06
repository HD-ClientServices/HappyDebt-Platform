"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { EvaluationCriteria } from "@/types/database";
import { Plus, Trash2 } from "lucide-react";
import { useState, useEffect } from "react";

const DEFAULT_CRITERIA: EvaluationCriteria[] = [
  { name: "Greeting & Rapport", description: "Professional intro, builds trust", weight: 0.15, max_score: 10 },
  { name: "Needs Discovery", description: "Asks qualifying questions", weight: 0.2, max_score: 10 },
  { name: "Product Knowledge", description: "Accurate info about MCA products", weight: 0.15, max_score: 10 },
  { name: "Objection Handling", description: "Addresses concerns effectively", weight: 0.2, max_score: 10 },
  { name: "Closing Technique", description: "Clear CTA, urgency, next steps", weight: 0.2, max_score: 10 },
  { name: "Compliance", description: "Follows regulatory requirements", weight: 0.1, max_score: 10 },
];

interface EvaluationTemplateEditorProps {
  userRole?: string;
}

export function EvaluationTemplateEditor({ userRole }: EvaluationTemplateEditorProps) {
  const isAdmin = userRole === "admin" || userRole === "happydebt_admin";
  const supabase = createClient();
  const queryClient = useQueryClient();
  const [criteria, setCriteria] = useState<EvaluationCriteria[]>(DEFAULT_CRITERIA);

  const { data: template, isLoading } = useQuery({
    queryKey: ["evaluation-templates"],
    queryFn: async () => {
      const { data } = await supabase
        .from("evaluation_templates")
        .select("*")
        .eq("is_active", true)
        .limit(1)
        .maybeSingle(); // returns null (not error) when no rows exist
      return data ?? null;
    },
    retry: false, // don't retry — null means "no template yet", show defaults
  });

  const weightsSum = criteria.reduce((s, c) => s + c.weight, 0);
  const weightsValid = Math.abs(weightsSum - 1) < 0.001;

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data: profile } = await supabase.from("users").select("org_id").eq("id", user.id).single();
      if (!profile?.org_id) throw new Error("No org");
      if (template?.id) {
        await supabase
          .from("evaluation_templates")
          .update({ criteria, name: template.name })
          .eq("id", template.id);
      } else {
        await supabase.from("evaluation_templates").insert({
          org_id: profile.org_id,
          name: "Default",
          is_active: true,
          criteria,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["evaluation-templates"] });
    },
  });

  const updateCriterion = (index: number, updates: Partial<EvaluationCriteria>) => {
    setCriteria((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...updates };
      return next;
    });
  };

  const addCriterion = () => {
    setCriteria((prev) => [
      ...prev,
      { name: "New criterion", description: "", weight: 0.1, max_score: 10 },
    ]);
  };

  const removeCriterion = (index: number) => {
    setCriteria((prev) => prev.filter((_, i) => i !== index));
  };

  useEffect(() => {
    if (template?.criteria && Array.isArray(template.criteria)) {
      setCriteria(template.criteria as EvaluationCriteria[]);
    }
  }, [template?.id, template?.criteria]);

  if (isLoading) {
    return <div className="text-muted-foreground">Loading template…</div>;
  }

  if (!isAdmin) {
    return (
      <Card className="bg-zinc-900/80 border-zinc-800">
        <CardHeader>
          <CardTitle className="font-heading">Evaluation template</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Only organization admins can edit evaluation templates.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-zinc-900/80 border-zinc-800">
      <CardHeader>
        <CardTitle className="font-heading">Evaluation template</CardTitle>
        <p className="text-sm text-muted-foreground">
          Weights must sum to 1.0. Current sum: {weightsSum.toFixed(2)}
          {!weightsValid && (
            <span className="text-rose-500 ml-2">(must be 1.0)</span>
          )}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {criteria.map((c, i) => (
          <div
            key={i}
            className="flex flex-wrap items-end gap-4 rounded-lg border border-zinc-800 p-4"
          >
            <div className="flex-1 min-w-[200px] space-y-2">
              <Label>Name</Label>
              <Input
                value={c.name}
                onChange={(e) => updateCriterion(i, { name: e.target.value })}
                className="bg-zinc-800 border-zinc-700"
              />
            </div>
            <div className="flex-1 min-w-[200px] space-y-2">
              <Label>Description</Label>
              <Input
                value={c.description}
                onChange={(e) => updateCriterion(i, { description: e.target.value })}
                className="bg-zinc-800 border-zinc-700"
              />
            </div>
            <div className="w-32 space-y-2">
              <Label>Weight</Label>
              <Input
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={c.weight}
                onChange={(e) =>
                  updateCriterion(i, { weight: Number(e.target.value) })
                }
                className="bg-zinc-800 border-zinc-700"
              />
            </div>
            <div className="w-24 space-y-2">
              <Label>Max score</Label>
              <Input
                type="number"
                min={1}
                value={c.max_score}
                onChange={(e) =>
                  updateCriterion(i, { max_score: Number(e.target.value) })
                }
                className="bg-zinc-800 border-zinc-700"
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => removeCriterion(i)}
              className="text-rose-500 hover:text-rose-400"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <Button variant="outline" onClick={addCriterion} className="border-zinc-700">
          <Plus className="mr-2 h-4 w-4" />
          Add criterion
        </Button>
        <div className="rounded-md border border-amber-600/40 bg-amber-950/30 px-4 py-2 text-sm text-amber-400">
          Changes will affect scoring for all future call analyses.
        </div>
        <div className="flex gap-2 pt-4">
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={!weightsValid || saveMutation.isPending}
          >
            {saveMutation.isPending ? "Saving…" : "Save template"}
          </Button>
          <Button variant="secondary" disabled>
            Re-evaluate all calls (Edge Function)
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
