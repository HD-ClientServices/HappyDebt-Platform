/**
 * POST /api/admin/invite-link/regenerate
 *
 * Generates a new invite_token for the effective org, revoking the
 * previous link. Requires admin/manager/intro_admin role.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEffectiveOrgId } from "@/lib/auth/getEffectiveOrgId";

const ALLOWED_ROLES = new Set(["admin", "manager", "intro_admin"]);

function buildLink(req: NextRequest, token: string): string {
  const url = new URL(req.url);
  const base = `${url.protocol}//${url.host}`;
  return `${base}/signup?invite=${token}`;
}

/** Generate 16 random bytes hex-encoded (matches the SQL gen_random_bytes(16)). */
function generateToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await getEffectiveOrgId(req);
    if (!ctx.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!ctx.role || !ALLOWED_ROLES.has(ctx.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const orgId = ctx.effectiveOrgId;
    if (!orgId) {
      return NextResponse.json({ error: "No org context" }, { status: 400 });
    }

    const newToken = generateToken();

    const admin = createAdminClient();
    const { data: org, error } = await admin
      .from("organizations")
      .update({ invite_token: newToken })
      .eq("id", orgId)
      .select("id, name, invite_token, allowed_email_domains")
      .single();

    if (error || !org) {
      return NextResponse.json(
        { error: error?.message ?? "Failed to regenerate token" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      orgId: org.id,
      orgName: org.name,
      token: org.invite_token,
      link: buildLink(req, org.invite_token),
      allowedDomains: org.allowed_email_domains ?? null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
