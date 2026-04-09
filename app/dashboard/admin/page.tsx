import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AdminContent } from "./AdminContent";
import type { PLGData, OrgRetention, OrgMonetization } from "./_panels/PLGPanel";
import type { OrgRow } from "./_panels/OrgsPanel";

export default async function AdminPage() {
  // Auth check
  const userSupabase = await createClient();
  const {
    data: { user },
  } = await userSupabase.auth.getUser();

  if (!user) redirect("/login");

  const email = user.email ?? "";
  const isStaff =
    email.endsWith("@happydebt.com") || email.endsWith("@tryintro.com");

  if (!isStaff) redirect("/dashboard/leads");

  // Fetch all admin data using service role (bypasses RLS)
  const supabase = createAdminClient();

  // PLG: Acquisition
  const { count: totalOrgs } = await supabase
    .from("organizations")
    .select("id", { count: "exact", head: true });

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const { count: newOrgsThisMonth } = await supabase
    .from("organizations")
    .select("id", { count: "exact", head: true })
    .gte("created_at", startOfMonth.toISOString());

  // PLG: Adoption
  const { data: templateOrgs } = await supabase
    .from("evaluation_templates")
    .select("org_id");
  const orgsWithTemplates = new Set((templateOrgs ?? []).map((r) => r.org_id)).size;

  const { data: callOrgs } = await supabase
    .from("call_recordings")
    .select("org_id")
    .eq("processing_status", "completed");
  const orgsWithAnalyzedCalls = new Set((callOrgs ?? []).map((r) => r.org_id)).size;

  const { data: leadOrgs } = await supabase.from("leads").select("org_id");
  const orgsWithLeads = new Set((leadOrgs ?? []).map((r) => r.org_id)).size;

  // PLG: Retention
  // We fetch the ghl_*_pipeline_id columns here too so the Organizations
  // panel can show "Pipelines configured" badges without a second query.
  const { data: allOrgs } = await supabase
    .from("organizations")
    .select("id, name, slug, plan, ghl_opening_pipeline_id, ghl_closing_pipeline_id")
    .order("created_at", { ascending: false });

  const { data: lastEvents } = await supabase
    .from("plg_events")
    .select("org_id, created_at")
    .order("created_at", { ascending: false });

  const { data: lastCalls } = await supabase
    .from("call_recordings")
    .select("org_id, created_at")
    .order("created_at", { ascending: false });

  const lastActivityMap = new Map<string, Date>();
  for (const e of lastEvents ?? []) {
    const d = new Date(e.created_at);
    const existing = lastActivityMap.get(e.org_id);
    if (!existing || d > existing) lastActivityMap.set(e.org_id, d);
  }
  for (const c of lastCalls ?? []) {
    const d = new Date(c.created_at);
    const existing = lastActivityMap.get(c.org_id);
    if (!existing || d > existing) lastActivityMap.set(c.org_id, d);
  }

  const now = new Date();
  const retentionList: OrgRetention[] = (allOrgs ?? [])
    .map((org) => {
      const last = lastActivityMap.get(org.id);
      const daysSinceActivity = last
        ? Math.floor((now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24))
        : null;
      return { id: org.id, name: org.name, daysSinceActivity };
    })
    .sort((a, b) => {
      if (a.daysSinceActivity === null && b.daysSinceActivity === null) return 0;
      if (a.daysSinceActivity === null) return 1;
      if (b.daysSinceActivity === null) return -1;
      return a.daysSinceActivity - b.daysSinceActivity;
    });

  // PLG: Monetization
  const { data: allLeads } = await supabase.from("leads").select("org_id, source, status");

  const monetMap = new Map<
    string,
    { intro: number; client: number; transferred: number; closedWon: number }
  >();

  for (const lead of allLeads ?? []) {
    if (!monetMap.has(lead.org_id)) {
      monetMap.set(lead.org_id, { intro: 0, client: 0, transferred: 0, closedWon: 0 });
    }
    const entry = monetMap.get(lead.org_id)!;
    if (lead.source === "client_upload") entry.client++;
    else entry.intro++;
    if (lead.status === "transferred") entry.transferred++;
    if (lead.status === "closed_won") entry.closedWon++;
  }

  const orgNameMap = new Map<string, string>();
  for (const org of allOrgs ?? []) orgNameMap.set(org.id, org.name);

  const monetizationList: OrgMonetization[] = Array.from(monetMap.entries()).map(
    ([orgId, stats]) => ({
      id: orgId,
      name: orgNameMap.get(orgId) ?? orgId,
      introLeads: stats.intro,
      clientLeads: stats.client,
      transferred: stats.transferred,
      closedWon: stats.closedWon,
    })
  );

  let totalTransferred = 0;
  let totalClosedWon = 0;
  for (const m of monetizationList) {
    totalTransferred += m.transferred;
    totalClosedWon += m.closedWon;
  }

  const plgData: PLGData = {
    totalOrgs: totalOrgs ?? 0,
    newOrgsThisMonth: newOrgsThisMonth ?? 0,
    orgsWithTemplates,
    orgsWithAnalyzedCalls,
    orgsWithLeads,
    retentionList,
    monetizationList,
    totalTransferred,
    totalClosedWon,
  };

  // Orgs panel data — count users + leads per org
  const { data: allUsers } = await supabase.from("users").select("org_id");
  const usersCountMap = new Map<string, number>();
  for (const u of allUsers ?? []) {
    usersCountMap.set(u.org_id, (usersCountMap.get(u.org_id) ?? 0) + 1);
  }

  const leadsCountMap = new Map<string, number>();
  for (const l of allLeads ?? []) {
    leadsCountMap.set(l.org_id, (leadsCountMap.get(l.org_id) ?? 0) + 1);
  }

  const orgs: OrgRow[] = (allOrgs ?? []).map((org) => ({
    id: org.id,
    name: org.name,
    slug: org.slug,
    plan: org.plan,
    usersCount: usersCountMap.get(org.id) ?? 0,
    leadsCount: leadsCountMap.get(org.id) ?? 0,
    hasPipelinesConfigured: !!org.ghl_opening_pipeline_id,
  }));

  return <AdminContent plgData={plgData} orgs={orgs} />;
}
