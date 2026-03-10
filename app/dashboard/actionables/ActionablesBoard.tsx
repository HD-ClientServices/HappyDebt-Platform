"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export function ActionablesBoard() {
  const supabase = createClient();
  const { data: actionables, isLoading } = useQuery({
    queryKey: ["actionables"],
    queryFn: async () => {
      const { data } = await supabase
        .from("actionables")
        .select("*")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const byStatus = {
    pending: (actionables ?? []).filter((a) => a.status === "pending"),
    in_progress: (actionables ?? []).filter((a) => a.status === "in_progress"),
    done: (actionables ?? []).filter((a) => a.status === "done"),
    dismissed: (actionables ?? []).filter((a) => a.status === "dismissed"),
  };

  if (isLoading) {
    return <Skeleton className="h-64 w-full rounded-xl" />;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {(["pending", "in_progress", "done"] as const).map((status) => (
        <Card key={status} className="bg-zinc-900/80 border-zinc-800">
          <CardContent className="p-4">
            <h2 className="font-heading font-medium mb-3 capitalize">
              {status.replace("_", " ")}
            </h2>
            <div className="space-y-2">
              {byStatus[status].length === 0 ? (
                <p className="text-sm text-muted-foreground">None</p>
              ) : (
                byStatus[status].map((a) => (
                  <div
                    key={a.id}
                    className="rounded-lg border border-zinc-800 p-3 text-sm"
                  >
                    <p className="font-medium">{a.title}</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      <Badge variant="secondary" className="text-xs">
                        {a.priority}
                      </Badge>
                      {a.source_type && (
                        <Badge variant="outline" className="text-xs">
                          {a.source_type}
                        </Badge>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
            <Button variant="outline" size="sm" className="mt-3 w-full border-zinc-700">
              New
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
