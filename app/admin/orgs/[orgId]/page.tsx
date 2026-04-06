import { createAdminClient } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import OrgHealthScore, {
  type OrgHealthData,
  type HealthFactor,
  type UsersByRole,
} from "./org-health-score";

export default async function AdminOrgDetailPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const supabase = createAdminClient();

  /* ------------------------------------------------------------------ */
  /*  Core org data (existing)                                          */
  /* ------------------------------------------------------------------ */

  const { data: org } = await supabase
    .from("organizations")
    .select("*")
    .eq("id", orgId)
    .single();
  if (!org) notFound();

  const { data: users } = await supabase
    .from("users")
    .select("id, email, role, last_active_at")
    .eq("org_id", orgId);

  /* ------------------------------------------------------------------ */
  /*  Health score queries                                              */
  /* ------------------------------------------------------------------ */

  const { count: templatesCount } = await supabase
    .from("evaluation_templates")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId);

  const { count: analyzedCallsCount } = await supabase
    .from("call_recordings")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("processing_status", "completed");

  const { data: leads } = await supabase
    .from("leads")
    .select("id, source")
    .eq("org_id", orgId);

  const leadsCount = leads?.length ?? 0;

  // Last PLG event for this org
  const { data: lastEvent } = await supabase
    .from("plg_events")
    .select("created_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const hasTemplate = (templatesCount ?? 0) > 0;
  const hasAnalyzedCalls = (analyzedCallsCount ?? 0) > 0;
  const hasLeads = leadsCount > 0;
  const isActive =
    lastEvent?.created_at != null &&
    new Date(lastEvent.created_at) > sevenDaysAgo;

  const factors: HealthFactor[] = [
    { label: "Has Template Configured", met: hasTemplate, points: 25 },
    { label: "Has Analyzed Calls", met: hasAnalyzedCalls, points: 25 },
    { label: "Has Leads", met: hasLeads, points: 25 },
    { label: "Active in Last 7 Days", met: isActive, points: 25 },
  ];

  const healthScore = factors.reduce(
    (sum, f) => sum + (f.met ? f.points : 0),
    0
  );

  /* ------------------------------------------------------------------ */
  /*  Usage metrics                                                     */
  /* ------------------------------------------------------------------ */

  let happydebtLeads = 0;
  let clientLeads = 0;
  for (const lead of leads ?? []) {
    if (lead.source === "happydebt") happydebtLeads++;
    else clientLeads++;
  }

  // Users by role
  const roleCountMap = new Map<string, number>();
  for (const u of users ?? []) {
    const role = u.role ?? "unknown";
    roleCountMap.set(role, (roleCountMap.get(role) ?? 0) + 1);
  }
  const usersByRole: UsersByRole[] = Array.from(roleCountMap.entries()).map(
    ([role, count]) => ({ role, count })
  );

  // Last user login
  let lastUserLogin: string | null = null;
  for (const u of users ?? []) {
    if (u.last_active_at) {
      if (!lastUserLogin || u.last_active_at > lastUserLogin) {
        lastUserLogin = u.last_active_at;
      }
    }
  }

  const healthData: OrgHealthData = {
    healthScore,
    factors,
    totalLeads: leadsCount,
    leadsBySource: { happydebt: happydebtLeads, clientUpload: clientLeads },
    totalCallsAnalyzed: analyzedCallsCount ?? 0,
    usersByRole,
    lastUserLogin,
  };

  /* ------------------------------------------------------------------ */
  /*  Render                                                            */
  /* ------------------------------------------------------------------ */

  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-semibold">{org.name}</h1>

      <Card className="bg-zinc-900/80 border-zinc-800">
        <CardHeader>
          <CardTitle className="font-heading">Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p>
            <span className="text-muted-foreground">Slug:</span> {org.slug}
          </p>
          <p>
            <span className="text-muted-foreground">Plan:</span> {org.plan}
          </p>
        </CardContent>
      </Card>

      <Card className="bg-zinc-900/80 border-zinc-800">
        <CardHeader>
          <CardTitle className="font-heading">Users</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1 text-sm">
            {(users ?? []).map((u) => (
              <li key={u.id}>
                {u.email} — {u.role}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Health Score & Usage Metrics */}
      <OrgHealthScore data={healthData} />
    </div>
  );
}
