import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

async function assertAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "happydebt_admin") return null;
  return user;
}

// GET /api/design-tokens — fetch all token overrides
export async function GET() {
  const supabase = await createClient();
  const user = await assertAdmin(supabase);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("design_token_overrides")
    .select("*")
    .order("token_category")
    .order("token_key");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ tokens: data });
}

// PUT /api/design-tokens — upsert a token override
export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const user = await assertAdmin(supabase);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await req.json();
  const { token_key, token_value, theme = "all", token_category = "color", org_id = null } = body;

  if (!token_key || !token_value) {
    return NextResponse.json({ error: "token_key and token_value are required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("design_token_overrides")
    .upsert(
      {
        org_id,
        token_key,
        token_value,
        token_category,
        theme,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "org_id,token_key,theme" }
    )
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ token: data });
}

// DELETE /api/design-tokens — remove a token override (revert to default)
export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const user = await assertAdmin(supabase);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const token_key = searchParams.get("token_key");

  if (id) {
    const { error } = await supabase
      .from("design_token_overrides")
      .delete()
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else if (token_key) {
    const { error } = await supabase
      .from("design_token_overrides")
      .delete()
      .eq("token_key", token_key);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    return NextResponse.json({ error: "id or token_key required" }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
