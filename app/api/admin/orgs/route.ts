/**
 * GET /api/admin/orgs — list all organizations (admin only).
 * Used by the OrgSwitcher to populate the impersonation dropdown.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

function isStaffEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const lower = email.toLowerCase();
  return lower.endsWith("@happydebt.com") || lower.endsWith("@tryintro.com");
}

export async function GET() {
  try {
    const userSupabase = await createClient();
    const {
      data: { user },
    } = await userSupabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();

    const isAdmin = isStaffEmail(user.email) || profile?.role === "intro_admin";
    if (!isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: orgs, error } = await admin
      .from("organizations")
      .select("id, name, slug, plan")
      .order("name", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ orgs: orgs ?? [] });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
