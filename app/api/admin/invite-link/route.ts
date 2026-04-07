/**
 * GET /api/admin/invite-link
 *   Returns the invite link for the effective org (respects impersonation).
 *
 * POST /api/admin/invite-link/regenerate
 *   Generates a new invite_token for the effective org, revoking the
 *   previous link.
 *
 * Both require admin/manager/intro_admin role.
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

export async function GET(req: NextRequest) {
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

    const admin = createAdminClient();
    const { data: org, error } = await admin
      .from("organizations")
      .select("id, name, invite_token, allowed_email_domains")
      .eq("id", orgId)
      .single();

    if (error || !org) {
      return NextResponse.json({ error: "Org not found" }, { status: 404 });
    }

    if (!org.invite_token) {
      return NextResponse.json(
        { error: "No invite token configured. Run migration 00011." },
        { status: 400 }
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
