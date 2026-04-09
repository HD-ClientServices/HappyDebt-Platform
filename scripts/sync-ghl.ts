/**
 * ⚠️ DEPRECATED — DO NOT RUN.
 *
 * This script was used for the very first GHL → Supabase data import
 * during project setup. It is broken for normal operation because:
 *
 *   1. It iterates over ALL opportunities (every pipeline, every status
 *      — open, won, lost, abandoned) and inserts each one as a
 *      `live_transfers` row.
 *   2. There is no filter by pipeline (neither opening nor closing).
 *   3. It sets `closing_status = NULL` on every row (that column didn't
 *      exist when the script was written).
 *   4. It leaves orphaned rows forever — subsequent runs of the in-app
 *      sync (`/api/pipeline/sync`) then have to work around the garbage.
 *
 * Running it again will re-pollute `live_transfers` with thousands of
 * orphaned rows. The in-app sync has an explicit stale cleanup that
 * will catch most of them eventually, but it's an avoidable mess.
 *
 * The correct sync is at `app/api/pipeline/sync/route.ts`. It only
 * pulls won-opps from the configured opening pipeline, upserts them,
 * and DB-level-cleans any stale rows in one query.
 *
 * If you genuinely need to re-import data from GHL, use that endpoint
 * (trigger it via the "Refresh from GHL" button in the Live Transfers
 * page or `curl` the route directly with a valid session).
 *
 * Run with: npx tsx scripts/sync-ghl.ts
 */

export { };

// Safety guard: abort unless the operator explicitly opts in.
if (process.env.ALLOW_LEGACY_GHL_SYNC !== "yes-i-know-this-is-dangerous") {
  console.error(
    "⛔ scripts/sync-ghl.ts is deprecated and will NOT run.\n" +
      "   It inserts every GHL opportunity (no pipeline/status filter)\n" +
      "   and pollutes live_transfers with orphaned rows.\n" +
      "   Use /api/pipeline/sync via the Live Transfers page instead.\n" +
      "\n" +
      "   If you really need to bypass this guard, set:\n" +
      "     ALLOW_LEGACY_GHL_SYNC=yes-i-know-this-is-dangerous"
  );
  process.exit(1);
}

const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GHL_API_KEY = "pit-0a60f252-8a04-4015-8a83-6c12bbb52a92";
const GHL_LOCATION_ID = "NXZFG9aQz6r1UXzZoedy";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing Supabase credentials. Ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
});

async function fetchGHL(endpoint: string, method = "GET", body?: any) {
    const url = `https://services.leadconnectorhq.com${endpoint}`;
    const res = await fetch(url, {
        method,
        headers: {
            Authorization: `Bearer ${GHL_API_KEY}`,
            Version: "2021-07-28",
            "Content-Type": "application/json",
            Accept: "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`GHL API Error: ${res.status} ${res.statusText} - ${errorText}`);
    }
    return res.json();
}

async function syncUsersToClosers(orgId: string) {
    console.log("\\n--- Syncing GHL Users -> Closers ---");
    const data = await fetchGHL(`/users/?locationId=${GHL_LOCATION_ID}`);
    const users = data.users || [];

    console.log(`Found ${users.length} users in GHL.`);

    for (const u of users) {
        if (u.deleted) continue;

        // Note: since we don't have a strict unique constraint on (org_id, email) or (ghl_user_id),
        // let's do a select then insert/update to be safe.
        const { data: existing } = await supabase.from("closers")
            .select("id")
            .eq("ghl_user_id", u.id)
            .eq("org_id", orgId)
            .maybeSingle();

        if (existing) {
            await supabase.from("closers").update({
                name: u.name,
                email: u.email,
                phone: u.phone,
                avatar_url: u.profilePhoto,
                active: true
            }).eq("id", existing.id);
            console.log(`Updated closer: ${u.name}`);
        } else {
            await supabase.from("closers").insert({
                org_id: orgId,
                ghl_user_id: u.id,
                name: u.name,
                email: u.email,
                phone: u.phone,
                avatar_url: u.profilePhoto,
                active: true
            });
            console.log(`Inserted closer: ${u.name}`);
        }
    }
}

async function syncOppotunitiesToTransfers(orgId: string) {
    console.log("\n--- Syncing GHL Opportunities -> Live Transfers ---");
    // Pagination
    let hasMore = true;
    let startAfter = undefined;
    let startAfterId = undefined;
    let totalSynced = 0;

    while (hasMore) {
        let url = `/opportunities/search?location_id=${GHL_LOCATION_ID}&limit=100`;
        if (startAfter) url += `&startAfter=${startAfter}`;
        if (startAfterId) url += `&startAfterId=${startAfterId}`;

        const data = await fetchGHL(url);
        const opps = data.opportunities || [];

        if (opps.length === 0) break;

        for (const opp of opps) {
            // Find the closer by GHL assignedTo ID
            const { data: closer } = await supabase.from("closers")
                .select("id")
                .eq("ghl_user_id", opp.assignedTo)
                .eq("org_id", orgId)
                .maybeSingle();

            const closerId = closer?.id || null;

            // Status mapping
            // If won = funded. If lost = declined. If open, depends on stage but we classify as transferred/connected
            let mappedStatus = "transferred";
            if (opp.status === "won") mappedStatus = "funded";
            if (opp.status === "lost") mappedStatus = "declined";

            const oppData = {
                org_id: orgId,
                closer_id: closerId,
                lead_name: opp.contact?.name || "Unknown Lead",
                lead_phone: opp.contact?.phone || null,
                lead_email: opp.contact?.email || null,
                business_name: opp.contact?.companyName || null,
                transfer_date: opp.createdAt,
                status: mappedStatus,
                amount: opp.monetaryValue || 0,
                ghl_opportunity_id: opp.id,
            };

            // Check existence
            const { data: existing } = await supabase.from("live_transfers")
                .select("id")
                .eq("ghl_opportunity_id", opp.id)
                .maybeSingle();

            if (existing) {
                await supabase.from("live_transfers").update(oppData).eq("id", existing.id);
            } else {
                await supabase.from("live_transfers").insert(oppData);
            }
            totalSynced++;
        }

        const m = data.meta || {};
        if (m.nextPageUrl && m.startAfter && m.startAfterId) {
            startAfter = m.startAfter;
            startAfterId = m.startAfterId;
        } else {
            hasMore = false;
        }
    }

    console.log(`Finished syncing ${totalSynced} opportunities.`);
}

async function run() {
    console.log("Starting GHL Sync...");

    // Lookup the default Org (Apex Funding Co. from seed)
    const { data: org } = await supabase.from("organizations")
        .select("id")
        .eq("slug", "apex-funding")
        .maybeSingle();

    if (!org) {
        console.error("Could not find Organization 'Apex Funding Co.'. Please run seed.ts first.");
        process.exit(1);
    }

    await syncUsersToClosers(org.id);
    await syncOppotunitiesToTransfers(org.id);

    console.log("\\n✅ Sync completed!");
}

run().catch(console.error);
