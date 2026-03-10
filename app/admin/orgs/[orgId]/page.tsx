import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function AdminOrgDetailPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const supabase = await createClient();
  const { data: org } = await supabase
    .from("organizations")
    .select("*")
    .eq("id", orgId)
    .single();
  if (!org) notFound();

  const { data: users } = await supabase
    .from("users")
    .select("id, email, role")
    .eq("org_id", orgId);

  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-semibold">{org.name}</h1>
      <Card className="bg-zinc-900/80 border-zinc-800">
        <CardHeader>
          <CardTitle className="font-heading">Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p><span className="text-muted-foreground">Slug:</span> {org.slug}</p>
          <p><span className="text-muted-foreground">Plan:</span> {org.plan}</p>
        </CardContent>
      </Card>
      <Card className="bg-zinc-900/80 border-zinc-800">
        <CardHeader>
          <CardTitle className="font-heading">Users</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1 text-sm">
            {(users ?? []).map((u) => (
              <li key={u.id}>{u.email} — {u.role}</li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
