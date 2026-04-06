import { createAdminClient } from "@/lib/supabase/admin";
import PLGDashboard, {
  type PLGData,
  type OrgRetention,
  type OrgMonetization,
} from "./plg-dashboard";

/**
 * Admin PLG page — server component.
 * Fetches all metrics using the admin (service-role) client to bypass RLS,
 * then hands the data to the <PLGDashboard /> client component for rendering.
 */
export default async function PLGPage() {
  const supabase = createAdminClient();

  /* ------------------------------------------------------------------ */
  /*  Acquisition                                                       */
  /* ------------------------------------------------------------------ */

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

  /* ------------------------------------------------------------------ */
  /*  Adoption                                                          */
  /* ------------------------------------------------------------------ */

  // Orgs with at least one evaluation template
  const { data: templateOrgs } = await supabase
    .from("evaluation_templates")
    .select("org_id");
  const orgsWithTemplates = new Set(
    (templateOrgs ?? []).map((r) => r.org_id)
  ).size;

  // Orgs with at least one completed call recording
  const { data: callOrgs } = await supabase
    .from("call_recordings")
    .select("org_id")
    .eq("processing_status", "completed");
  const orgsWithAnalyzedCalls = new Set(
    (callOrgs ?? []).map((r) => r.org_id)
  ).size;

  // Orgs with at least one lead
  const { data: leadOrgs } = await supabase
    .from("leads")
    .select("org_id");
  const orgsWithLeads = new Set(
    (leadOrgs ?? []).map((r) => r.org_id)
  ).size;

  /* ------------------------------------------------------------------ */
  /*  Retention                                                         */
  /* ------------------------------------------------------------------ */

  const { data: allOrgs } = await supabase
    .from("organizations")
    .select("id, name")
    .order("created_at", { ascending: false });

  // Last plg_event per org
  const { data: lastEvents } = await supabase
    .from("plg_events")
    .select("org_id, created_at")
    .order("created_at", { ascending: false });

  // Last call_recording per org
  const { data: lastCalls } = await supabase
    .from("call_recordings")
    .select("org_id, created_at")
    .order("created_at", { ascending: false });

  // Build a map of org_id -> last activity date
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
      // nulls (never active) go to the end
      if (a.daysSinceActivity === null && b.daysSinceActivity === null) return 0;
      if (a.daysSinceActivity === null) return 1;
      if (b.daysSinceActivity === null) return -1;
      return a.daysSinceActivity - b.daysSinceActivity;
    });

  /* ------------------------------------------------------------------ */
  /*  Monetization                                                      */
  /* ------------------------------------------------------------------ */

  const { data: allLeads } = await supabase
    .from("leads")
    .select("org_id, source, status");

  // Build per-org monetization stats
  const monetMap = new Map<
    string,
    { happydebt: number; client: number; transferred: number; closedWon: number }
  >();

  for (const lead of allLeads ?? []) {
    if (!monetMap.has(lead.org_id)) {
      monetMap.set(lead.org_id, {
        happydebt: 0,
        client: 0,
        transferred: 0,
        closedWon: 0,
      });
    }
    const entry = monetMap.get(lead.org_id)!;

    if (lead.source === "happydebt") entry.happydebt++;
    else entry.client++;

    if (lead.status === "transferred") entry.transferred++;
    if (lead.status === "closed_won") entry.closedWon++;
  }

  // Build org name lookup
  const orgNameMap = new Map<string, string>();
  for (const org of allOrgs ?? []) {
    orgNameMap.set(org.id, org.name);
  }

  const monetizationList: OrgMonetization[] = Array.from(monetMap.entries()).map(
    ([orgId, stats]) => ({
      id: orgId,
      name: orgNameMap.get(orgId) ?? orgId,
      happydebtLeads: stats.happydebt,
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

  /* ------------------------------------------------------------------ */
  /*  Assemble props                                                    */
  /* ------------------------------------------------------------------ */

  const data: PLGData = {
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

  return <PLGDashboard data={data} />;
}
