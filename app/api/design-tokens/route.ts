/**
 * Design tokens API.
 * GET — public, returns the global tokens (so all users see consistent theming)
 * PATCH — restricted to HappyDebt staff (email @happydebt.com / @tryintro.com)
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("design_tokens")
      .select("tokens, updated_at")
      .eq("scope", "global")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const userSupabase = await createClient();
    const {
      data: { user },
    } = await userSupabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const email = user.email || "";
    const isStaff =
      email.endsWith("@happydebt.com") || email.endsWith("@tryintro.com");

    if (!isStaff) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    if (!body?.tokens || typeof body.tokens !== "object") {
      return NextResponse.json(
        { error: "Missing or invalid 'tokens' object" },
        { status: 400 }
      );
    }

    const adminSupabase = createAdminClient();
    const { data, error } = await adminSupabase
      .from("design_tokens")
      .update({
        tokens: body.tokens,
        updated_by: user.id,
      })
      .eq("scope", "global")
      .select("tokens, updated_at")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
