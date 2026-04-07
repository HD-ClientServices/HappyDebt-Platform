/**
 * POST /api/onboarding/create-org
 *
 * Body: { name: string }
 *
 * Creates a new organization for the authenticated user. The user becomes
 * the org's first member with role='admin'. The org's allowed_email_domains
 * is automatically set to the user's email domain, and a unique invite_token
 * is generated.
 *
 * This is the server-side replacement for the previous client-side
 * onboarding flow which allowed users to manipulate their own role.
 *
 * Returns 409 if the user already has a profile in `public.users`.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/** Generate a hex token from 16 random bytes (matches gen_random_bytes(16)). */
function generateInviteToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Generate a 4-char random suffix to make slugs unique. */
function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 6);
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function POST(req: NextRequest) {
  try {
    const userSupabase = await createClient();
    const {
      data: { user },
    } = await userSupabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const rawName = typeof body?.name === "string" ? body.name.trim() : "";

    if (!rawName || rawName.length < 2) {
      return NextResponse.json(
        { error: "Organization name must be at least 2 characters" },
        { status: 400 }
      );
    }

    const userEmail = (user.email ?? "").toLowerCase();
    const userDomain = userEmail.split("@")[1] ?? "";

    if (!userEmail || !userDomain) {
      return NextResponse.json(
        { error: "User has no valid email" },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    // 1. Check if user already has a profile
    const { data: existing } = await admin
      .from("users")
      .select("id, org_id")
      .eq("id", user.id)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        {
          error: "User already onboarded",
          orgId: existing.org_id,
        },
        { status: 409 }
      );
    }

    // 2. Build a unique slug + invite token
    const baseSlug = slugify(rawName) || "org";
    const slug = `${baseSlug}-${randomSuffix()}`;
    const inviteToken = generateInviteToken();

    // 3. Insert the organization
    const { data: org, error: orgErr } = await admin
      .from("organizations")
      .insert({
        name: rawName,
        slug,
        invite_token: inviteToken,
        allowed_email_domains: [userDomain],
      })
      .select("id, name, slug")
      .single();

    if (orgErr || !org) {
      return NextResponse.json(
        { error: orgErr?.message ?? "Failed to create organization" },
        { status: 500 }
      );
    }

    // 4. Insert the user as admin
    const { error: userErr } = await admin.from("users").insert({
      id: user.id,
      org_id: org.id,
      email: userEmail,
      role: "admin",
      onboarding_completed: true,
    });

    if (userErr) {
      // Best-effort cleanup: remove the org we just created so the user can retry
      await admin.from("organizations").delete().eq("id", org.id);
      return NextResponse.json(
        { error: userErr.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      orgId: org.id,
      orgName: org.name,
      orgSlug: org.slug,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
