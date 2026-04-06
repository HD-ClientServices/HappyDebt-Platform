"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface CloserWithStats {
  id: string;
  name: string;
  avatar_url?: string;
  avgScore: number;
  count: number;
  avgSentiment: number;
  critical: number;
}

export function CloserRankingPanel() {
  const router = useRouter();
  const { data: closers, isLoading } = useQuery<CloserWithStats[]>({
    queryKey: ["closers-with-stats"],
    queryFn: async () => {
      const res = await fetch("/api/closers/stats");
      if (!res.ok) throw new Error("Failed to fetch closer stats");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <Card className="bg-zinc-900/80 border-zinc-800">
        <CardHeader>
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent>
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-14 w-full mb-2" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-zinc-900/80 border-zinc-800">
      <CardHeader>
        <CardTitle className="font-heading text-lg">Closer ranking</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {(closers ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No closers yet.</p>
        ) : (
          (closers ?? []).map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => router.push(`/dashboard/voc/${c.id}`)}
              className="w-full flex items-center gap-3 rounded-lg p-2 text-left hover:bg-zinc-800/50 transition-colors"
            >
              <Avatar className="h-9 w-9">
                <AvatarImage src={c.avatar_url} />
                <AvatarFallback className="bg-zinc-700 text-xs">
                  {c.name.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{c.name}</p>
                <p className="text-xs text-muted-foreground">
                  Avg {c.avgScore != null ? c.avgScore.toFixed(1) : "—"} · {c.count ?? 0} calls
                  {c.critical ? (
                    <Badge variant="destructive" className="ml-1 text-xs">
                      {c.critical} critical
                    </Badge>
                  ) : null}
                </p>
              </div>
            </button>
          ))
        )}
      </CardContent>
    </Card>
  );
}
