import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEffectiveOrgId } from "@/lib/auth/getEffectiveOrgId";

/**
 * POST /api/leads/upload - Bulk upload leads from CSV/JSON
 *
 * Auth: user must have admin or intro_admin role.
 * Body: { leads: Array<{ name, phone?, email?, business_name? }> }
 *
 * Deduplicates by phone within the org before inserting.
 * Inserts in batches of 50.
 */
export async function POST(request: Request) {
  try {
    // ── Auth ──────────────────────────────────────────────────────
    const ctx = await getEffectiveOrgId(request);
    if (!ctx.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminSupabase = createAdminClient();

    if (ctx.role !== "admin" && ctx.role !== "intro_admin") {
      return NextResponse.json(
        { error: "Forbidden: admin role required" },
        { status: 403 }
      );
    }

    const orgId = ctx.effectiveOrgId;
    if (!orgId) {
      return NextResponse.json({ error: "No org context" }, { status: 400 });
    }

    // ── Validate body ────────────────────────────────────────────
    const body = await request.json();
    const { leads } = body;

    if (!Array.isArray(leads) || leads.length === 0) {
      return NextResponse.json(
        { error: "leads must be a non-empty array" },
        { status: 400 }
      );
    }

    // Filter out leads that don't have a name
    const validLeads = leads.filter(
      (l: Record<string, unknown>) =>
        l.name && typeof l.name === "string" && (l.name as string).trim().length > 0
    );
    const invalidCount = leads.length - validLeads.length;

    // ── Dedup by phone within org ────────────────────────────────
    // Collect all phones from the incoming leads
    const incomingPhones = validLeads
      .map((l: Record<string, unknown>) => l.phone)
      .filter((p): p is string => typeof p === "string" && p.trim().length > 0);

    const existingPhones = new Set<string>();

    if (incomingPhones.length > 0) {
      // Query existing phones in batches to avoid URI-length limits
      for (let i = 0; i < incomingPhones.length; i += 200) {
        const chunk = incomingPhones.slice(i, i + 200);
        const { data: existing } = await adminSupabase
          .from("leads")
          .select("phone")
          .eq("org_id", orgId)
          .in("phone", chunk);

        (existing || []).forEach((row: { phone: string | null }) => {
          if (row.phone) existingPhones.add(row.phone);
        });
      }
    }

    // Also dedup within the incoming batch itself (keep first occurrence)
    const seenPhones = new Set<string>();
    const toInsert: Record<string, unknown>[] = [];
    let duplicateCount = 0;

    for (const lead of validLeads) {
      const phone = typeof lead.phone === "string" ? lead.phone.trim() : null;

      // Skip if phone exists in DB or already seen in this batch
      if (phone && (existingPhones.has(phone) || seenPhones.has(phone))) {
        duplicateCount++;
        continue;
      }
      if (phone) seenPhones.add(phone);

      toInsert.push({
        org_id: orgId,
        name: (lead.name as string).trim(),
        phone: phone || null,
        email: typeof lead.email === "string" ? lead.email.trim() : null,
        business_name:
          typeof lead.business_name === "string"
            ? lead.business_name.trim()
            : null,
        source: "client_upload",
        status: "in_sequence",
      });
    }

    // ── Insert in batches of 50 ──────────────────────────────────
    let insertedCount = 0;
    let errorCount = 0;

    for (let i = 0; i < toInsert.length; i += 50) {
      const chunk = toInsert.slice(i, i + 50);
      const { error } = await adminSupabase.from("leads").insert(chunk);

      if (error) {
        console.error("[leads/upload] Batch insert error:", error.message);
        errorCount += chunk.length;
      } else {
        insertedCount += chunk.length;
      }
    }

    return NextResponse.json({
      inserted: insertedCount,
      duplicates: duplicateCount,
      errors: errorCount + invalidCount,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
