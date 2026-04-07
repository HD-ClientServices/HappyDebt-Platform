/**
 * GET /api/invites/lookup?token=<token>
 *
 * Public endpoint (no auth required) that resolves an invite token to
 * the org name + allowed email domains. Used by the signup page to
 * display "You're joining: <Org>" and validate the email domain
 * client-side before submission.
 *
 * Returns 404 if the token doesn't match any organization.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");

  if (!token || token.length < 8) {
    return NextResponse.json(
      { valid: false, error: "Invalid token" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { data: org, error } = await admin
    .from("organizations")
    .select("id, name, allowed_email_domains")
    .eq("invite_token", token)
    .maybeSingle();

  if (error || !org) {
    return NextResponse.json({ valid: false }, { status: 404 });
  }

  return NextResponse.json({
    valid: true,
    orgId: org.id,
    orgName: org.name,
    allowedDomains: org.allowed_email_domains ?? null,
  });
}
