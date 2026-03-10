/**
 * Seed script for HappyDebt demo data.
 * Run with: npx tsx scripts/seed.ts (requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env)
 *
 * Creates: 1 org "Apex Funding Co.", 5 closers, 80 live transfers, 60 call recordings,
 * 1 evaluation template, 20 actionables, and PLG events.
 */
export { };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

// Ensure the fetch is available in Node if older version
const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Helper for random data
function randChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomDate(start: Date, end: Date): Date {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

async function seed() {
  console.log("Starting seed process...");

  // 1. Create Organization
  const { data: org, error: orgErr } = await supabase
    .from("organizations")
    .upsert({
      name: "Apex Funding Co.",
      slug: "apex-funding",
      plan: "growth",
    }, { onConflict: "slug" })
    .select("id")
    .single();

  if (orgErr || !org) {
    console.error("Failed to create org:", orgErr);
    return;
  }
  console.log(`✅ Org created/found: Apex Funding Co. [${org.id}]`);

  // 2. Create Closers
  const closersData = [
    { org_id: org.id, name: "John Smith", email: "john@apex.com", active: true },
    { org_id: org.id, name: "Maria Garcia", email: "maria@apex.com", active: true },
    { org_id: org.id, name: "David Lee", email: "david@apex.com", active: true },
    { org_id: org.id, name: "Sarah Jones", email: "sarah@apex.com", active: true },
    { org_id: org.id, name: "Mike Brown", email: "mike@apex.com", active: true },
  ];

  // We delete existing closers for a fresh seed or ignore, but it's simpler to just insert or fetch.
  // Using upsert based on email might be better, or just truncate and insert if developing.
  // For safety, let's select existing closers, if empty, insert.
  let { data: closers } = await supabase.from("closers").select("*").eq("org_id", org.id);

  if (!closers || closers.length === 0) {
    const { data: inserted } = await supabase.from("closers").insert(closersData).select("*");
    closers = inserted;
  }
  console.log(`✅ ${closers?.length} Closers ready.`);

  // If we don't have closers something went wrong
  if (!closers || closers.length === 0) return;

  // 3. Create Live Transfers (80 items)
  console.log("Creating live transfers...");
  const transferStatuses = ["transferred", "connected", "funded", "declined", "no_answer"];
  const businesses = ["Alpha Tech", "Beta Solutions", "Gamma LLC", "Delta Plumbers", "Epsilon Construction"];

  const liveTransfersToInsert = [];
  const now = new Date();
  const past30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  for (let i = 0; i < 80; i++) {
    liveTransfersToInsert.push({
      org_id: org.id,
      closer_id: randChoice(closers as any[]).id,
      lead_name: `Lead ${i}`,
      lead_phone: `+1555${randInt(1000000, 9999999)}`,
      lead_email: `lead${i}@example.com`,
      business_name: randChoice(businesses),
      transfer_date: randomDate(past30Days, now).toISOString(),
      status: randChoice(transferStatuses),
      amount: randChoice([5000, 10000, 25000, 50000, 100000]),
      notes: "Sample generated note for transfer.",
    });
  }

  const { data: liveTransfers, error: ltErr } = await supabase
    .from("live_transfers")
    .insert(liveTransfersToInsert)
    .select("id, closer_id, transfer_date");

  if (ltErr) console.error("Error inserting live transfers:", ltErr);
  else console.log(`✅ 80 Live transfers created.`);

  // 4. Create Call Recordings (60 items mapped to transfers)
  console.log("Creating call recordings...");
  const sampleTranscripts = [
    "Hello, this is John from HappyDebt. How can I help you today?",
    "I understand you are looking for funding. Our rates are very competitive.",
    "This is David. Sadly we can't offer the loan at this time, but we can review in 3 months.",
    "Hey, Maria speaking. I've sent the contract to your email.",
  ];

  const callRecordingsToInsert = [];
  if (liveTransfers && liveTransfers.length > 0) {
    // We'll create exactly 60 recordings
    for (let i = 0; i < 60; i++) {
      const transfer = liveTransfers[i]; // Pick one to map
      callRecordingsToInsert.push({
        org_id: org.id,
        closer_id: transfer.closer_id,
        live_transfer_id: transfer.id,
        recording_url: `https://example.com/audio/call_${i}.mp3`,
        duration_seconds: randInt(60, 1800), // 1 to 30 mins
        call_date: transfer.transfer_date,
        transcript: randChoice(sampleTranscripts),
        ai_analysis: {
          summary: "This was a generally positive call where options were discussed.",
          objection_handling: "Good",
          closing_skills: "Excellent"
        },
        sentiment_score: (Math.random() * 2 - 1).toFixed(2), // -1 to 1
        evaluation_score: randInt(30, 100),
        strengths: ["Clear communication", "Good pacing"],
        improvement_areas: ["Asked fewer questions", "Missed a buying signal"],
        is_critical: randChoice([true, false, false, false]), // 25% chance
        critical_action_plan: "Review compliance guidelines.",
      });
    }

    const { error: crErr } = await supabase.from("call_recordings").insert(callRecordingsToInsert);
    if (crErr) console.error("Error inserting call recordings:", crErr);
    else console.log(`✅ 60 Call recordings created.`);
  }

  // 5. Evaluation Templates
  console.log("Creating evaluation template...");
  const { data: tmpl, error: evtErr } = await supabase.from("evaluation_templates").insert({
    org_id: org.id,
    name: "Standard Sales Rubric",
    is_active: true,
    criteria: [
      { name: "Greeting & Info", weight: 20 },
      { name: "Objection Handling", weight: 40 },
      { name: "Closing", weight: 40 },
    ],
  }).select("id").single();

  if (evtErr) console.error("Error inserting evaluation template:", evtErr);
  else console.log(`✅ Evaluation template created.`);

  // 6. Actionables
  // Get an admin user randomly if possible to assign 'user_id' -> Actually from schema user_id is NOT NULL
  // Let's get any user in this org, if exists, else we can't create actionables reliably.
  const { data: users } = await supabase.from("users").select("id").eq("org_id", org.id).limit(1);
  if (users && users.length > 0) {
    console.log("Creating actionables...");
    const adminUser = users[0];
    const actionablesToInsert = [];
    const priorities = ["urgent", "high", "medium", "low"];
    const actionableStatuses = ["pending", "in_progress", "done", "dismissed"];

    for (let i = 0; i < 20; i++) {
      actionablesToInsert.push({
        org_id: org.id,
        user_id: adminUser.id,
        title: `Actionable Task ${i}`,
        description: "Please review this call and check compliance.",
        source_type: randChoice(["call_review", "closer_profile", "overview", "suggestion", "manual"]),
        priority: randChoice(priorities),
        status: randChoice(actionableStatuses),
        due_date: randomDate(now, new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)).toISOString(),
        assigned_to: randChoice(closers as any[]).id
      });
    }

    const { error: actErr } = await supabase.from("actionables").insert(actionablesToInsert);
    if (actErr) console.error("Error inserting actionables:", actErr);
    else console.log(`✅ 20 Actionables created.`);
  } else {
    console.log("⚠️ No users found in this org. Skipping actionables creation (needs a valid user_id).");
  }

  console.log("\n🚀 Demo database successfully seeded!");
  console.log("Next steps: Make sure to check the platform visually for UI updates.");
}

seed().catch(console.error);
