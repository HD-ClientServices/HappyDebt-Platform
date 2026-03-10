import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function PLGPage() {
  const supabase = await createClient();
  const { count: orgsCount } = await supabase
    .from("organizations")
    .select("id", { count: "exact", head: true });
  const { count: eventsCount } = await supabase
    .from("plg_events")
    .select("id", { count: "exact", head: true });

  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-semibold">PLG Dashboard</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="bg-zinc-900/80 border-zinc-800">
          <CardHeader>
            <CardTitle className="font-heading text-lg">Organizations</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{orgsCount ?? 0}</p>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900/80 border-zinc-800">
          <CardHeader>
            <CardTitle className="font-heading text-lg">PLG events</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{eventsCount ?? 0}</p>
          </CardContent>
        </Card>
      </div>
      <p className="text-sm text-muted-foreground">
        Acquisition, Retention, Monetization tabs and full metrics — implement with React Query and date range picker.
      </p>
    </div>
  );
}
