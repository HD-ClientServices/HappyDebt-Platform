/**
 * POST /api/onboarding/join-org
 *
 * Body: { token: string }
 *
 * Authenticated endpoint that joins the current Supabase user to an
 * organization identified by an invite token. Enforces:
 *  - The user's email domain matches the org's allowed_email_domains
 *    (if any are set).
 *  - The first user to join gets role='admin'; all subsequent users get
 *    role='viewer'.
 *  - If the org had no allowed_email_domains and this is the first user,
 *    the user's domain becomes the new restriction for future joinees.
 *
 * Returns 409 if the user already has an entry in `public.users`.
 * Returns 403 if the email domain is not allowed.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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
    const token = typeof body?.token === "string" ? body.token.trim() : "";

    if (!token) {
      return NextResponse.json({ error: "Missing token" }, { status: 400 });
    }

    const admin = createAdminClient();

    // 1. Validate the token belongs to a real org
    const { data: org, error: orgErr } = await admin
      .from("organizations")
      .select("id, name, allowed_email_domains")
      .eq("invite_token", token)
      .maybeSingle();

    if (orgErr || !org) {
      return NextResponse.json(
        { error: "Invalid or expired invite token" },
        { status: 404 }
      );
    }

    // 2. Extract user's email domain
    const userEmail = (user.email ?? "").toLowerCase();
    const userDomain = userEmail.split("@")[1] ?? "";

    if (!userEmail || !userDomain) {
      return NextResponse.json(
        { error: "User has no valid email" },
        { status: 400 }
      );
    }

    // 3. Validate domain restriction (if any)
    const allowedDomains: string[] | null = org.allowed_email_domains ?? null;
    if (allowedDomains && allowedDomains.length > 0) {
      const normalized = allowedDomains.map((d) => d.toLowerCase());
      if (!normalized.includes(userDomain)) {
        return NextResponse.json(
          {
            error: `This organization only accepts emails from: ${normalized
              .map((d) => `@${d}`)
              .join(", ")}`,
          },
          { status: 403 }
        );
      }
    }

    // 4. Check if user already has a profile (idempotent guard)
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

    // 5. Count existing users in this org to determine role
    const { count: existingUserCount } = await admin
      .from("users")
      .select("id", { count: "exact", head: true })
      .eq("org_id", org.id);

    const isFirstUser = (existingUserCount ?? 0) === 0;
    const role = isFirstUser ? "admin" : "viewer";

    // 6. Insert the user
    const { error: insertErr } = await admin.from("users").insert({
      id: user.id,
      org_id: org.id,
      email: userEmail,
      role,
      onboarding_completed: true,
    });

    if (insertErr) {
      return NextResponse.json(
        { error: insertErr.message },
        { status: 500 }
      );
    }

    // 7. If first user AND no allowed_email_domains was set, set it now
    if (
      isFirstUser &&
      (!allowedDomains || allowedDomains.length === 0)
    ) {
      await admin
        .from("organizations")
        .update({ allowed_email_domains: [userDomain] })
        .eq("id", org.id);
    }

    return NextResponse.json({
      success: true,
      orgId: org.id,
      orgName: org.name,
      role,
      isFirstUser,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
