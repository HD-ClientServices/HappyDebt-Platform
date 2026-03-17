import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function AdminOrgsPage() {
  const supabase = await createClient();
  const { data: orgs } = await supabase
    .from("organizations")
    .select("id, name, slug, plan")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-semibold">Organizations</h1>
      <div className="grid gap-4">
        {(orgs ?? []).length === 0 ? (
          <p className="text-muted-foreground">No organizations.</p>
        ) : (
          (orgs ?? []).map((org) => (
            <Link key={org.id} href={`/admin/orgs/${org.id}`}>
              <Card className="bg-card border-border hover:border-border/80 transition-colors">
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <p className="font-medium">{org.name}</p>
                    <p className="text-sm text-muted-foreground">{org.slug} · {org.plan}</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
