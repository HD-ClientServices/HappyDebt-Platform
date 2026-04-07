"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { useCurrentUserOrg } from "@/hooks/useCurrentUserOrg";

export function OrgSettings() {
  const supabase = createClient();
  const { data: userOrg } = useCurrentUserOrg();
  const orgId = userOrg?.orgId;

  const { data: org, isLoading } = useQuery({
    queryKey: ["organization", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from("organizations")
        .select("*")
        .eq("id", orgId!)
        .single();
      return data;
    },
  });

  if (isLoading) {
    return <div className="text-muted-foreground">Loading…</div>;
  }

  return (
    <Card className="bg-zinc-900/80 border-zinc-800">
      <CardHeader>
        <CardTitle className="font-heading">Organization</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label>Organization name</Label>
          <Input
            defaultValue={org?.name}
            className="bg-zinc-800 border-zinc-700 max-w-md"
            readOnly
          />
        </div>
        <div className="space-y-2">
          <Label>Critical call threshold (score below this = critical)</Label>
          <div className="flex items-center gap-4 max-w-md">
            <Slider defaultValue={[40]} min={0} max={100} step={5} className="flex-1" />
            <span className="text-sm text-muted-foreground w-8">40</span>
          </div>
        </div>
        <div>
          <Label className="block mb-2">Plan</Label>
          <p className="text-sm text-muted-foreground">
            Current plan: {org?.plan ?? "free"}
          </p>
          <Button variant="outline" size="sm" className="mt-2 border-zinc-700">
            Upgrade
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
