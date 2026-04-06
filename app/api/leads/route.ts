import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Get the authenticated user's id and org_id.
 */
async function getAuthUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("users")
    .select("id, org_id, role")
    .eq("id", user.id)
    .single();

  return profile ?? null;
}

/**
 * GET /api/leads - List leads with filters
 *
 * Query params:
 *   status  - filter by lead status
 *   source  - filter by lead source
 *   search  - ILIKE search on name / business_name
 *   limit   - page size (default 50)
 *   offset  - pagination offset (default 0)
 */
export async function GET(request: Request) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const source = searchParams.get("source");
    const search = searchParams.get("search");
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 200);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    // Use user-scoped client so RLS handles org filtering
    const supabase = await createClient();

    let query = supabase
      .from("leads")
      .select("*, closers(name)", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq("status", status);
    }
    if (source) {
      query = query.eq("source", source);
    }
    if (search) {
      query = query.or(
        `name.ilike.%${search}%,business_name.ilike.%${search}%`
      );
    }

    const { data: leads, count, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ leads: leads || [], total: count ?? 0 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/leads - Create a single lead
 *
 * Body: { name, phone?, email?, business_name?, source?, notes? }
 */
export async function POST(request: Request) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name, phone, email, business_name, source, notes } = body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "name is required" },
        { status: 400 }
      );
    }

    const adminSupabase = createAdminClient();
    const { data: lead, error } = await adminSupabase
      .from("leads")
      .insert({
        org_id: user.org_id,
        name: name.trim(),
        phone: phone || null,
        email: email || null,
        business_name: business_name || null,
        source: source || "client_upload",
        notes: notes || null,
        status: "in_sequence",
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(lead, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/leads - Update a lead
 *
 * Body: { id, status?, closer_id?, amount?, notes? }
 */
export async function PATCH(request: Request) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { id, status, closer_id, amount, notes } = body;

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    // Build the update payload with only provided fields
    const updates: Record<string, unknown> = {};
    if (status !== undefined) updates.status = status;
    if (closer_id !== undefined) updates.closer_id = closer_id;
    if (amount !== undefined) updates.amount = amount;
    if (notes !== undefined) updates.notes = notes;

    // Auto-set date fields on status transitions
    if (status === "closed_won") {
      updates.closed_date = new Date().toISOString();
    }

    const adminSupabase = createAdminClient();

    // For "transferred" status, only set transfer_date if not already set
    if (status === "transferred") {
      const { data: existing } = await adminSupabase
        .from("leads")
        .select("transfer_date")
        .eq("id", id)
        .eq("org_id", user.org_id)
        .single();

      if (!existing) {
        return NextResponse.json({ error: "Lead not found" }, { status: 404 });
      }
      if (!existing.transfer_date) {
        updates.transfer_date = new Date().toISOString();
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 }
      );
    }

    const { data: lead, error } = await adminSupabase
      .from("leads")
      .update(updates)
      .eq("id", id)
      .eq("org_id", user.org_id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    return NextResponse.json(lead);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
