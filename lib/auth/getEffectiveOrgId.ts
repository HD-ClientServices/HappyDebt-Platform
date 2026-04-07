import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export interface EffectiveOrgContext {
  userId: string | null;
  email: string | null;
  role: string | null;
  /** The org_id from the user's profile row — their "home" org. */
  realOrgId: string | null;
  /** The org_id that should be used for this request (impersonated if admin). */
  effectiveOrgId: string | null;
  isAdmin: boolean;
  isImpersonating: boolean;
}

function isStaffEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const lower = email.toLowerCase();
  return lower.endsWith("@happydebt.com") || lower.endsWith("@tryintro.com");
}

/**
 * Server-side helper for API routes. Reads the current authenticated user
 * and determines which org_id their queries should operate on.
 *
 * If the request carries the `x-impersonate-org-id` header AND the caller
 * is a staff/intro_admin, the returned `effectiveOrgId` is the impersonated
 * org (after validating it exists). Non-admin callers that send the header
 * are silently ignored — the header has no effect.
 *
 * Use this instead of the legacy `getAuthOrgId()` pattern to make API
 * routes impersonation-aware.
 */
export async function getEffectiveOrgId(
  req: Request
): Promise<EffectiveOrgContext> {
  const empty: EffectiveOrgContext = {
    userId: null,
    email: null,
    role: null,
    realOrgId: null,
    effectiveOrgId: null,
    isAdmin: false,
    isImpersonating: false,
  };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return empty;

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("users")
    .select("org_id, role")
    .eq("id", user.id)
    .single();

  if (!profile) {
    return {
      ...empty,
      userId: user.id,
      email: user.email ?? null,
    };
  }

  const email = user.email ?? null;
  const isAdmin = isStaffEmail(email) || profile.role === "intro_admin";

  const base: EffectiveOrgContext = {
    userId: user.id,
    email,
    role: profile.role,
    realOrgId: profile.org_id,
    effectiveOrgId: profile.org_id,
    isAdmin,
    isImpersonating: false,
  };

  const headerOrgId = req.headers.get("x-impersonate-org-id");
  if (!headerOrgId || !isAdmin) {
    return base;
  }

  // Validate the impersonated org exists — admin client bypasses RLS so we
  // can safely check even for orgs the caller shouldn't normally see.
  const { data: targetOrg, error: orgErr } = await admin
    .from("organizations")
    .select("id")
    .eq("id", headerOrgId)
    .maybeSingle();

  if (orgErr || !targetOrg) {
    // Impersonation target not found — fall back to the real org.
    return base;
  }

  return {
    ...base,
    effectiveOrgId: headerOrgId,
    isImpersonating: true,
  };
}
