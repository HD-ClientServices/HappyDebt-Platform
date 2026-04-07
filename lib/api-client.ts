import { useImpersonationStore } from "@/store/impersonation-store";

/**
 * Wrapper around `fetch` that automatically injects the
 * `x-impersonate-org-id` header when the admin is impersonating an org.
 *
 * Use this in place of `fetch` for any client-side request to
 * `/api/*` routes so that impersonation context propagates to the server.
 *
 * The server reads the header via `lib/auth/getEffectiveOrgId.ts` and
 * only honors it for verified staff users. For non-admin users the header
 * is silently ignored, so it's safe to always include it.
 */
export async function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const { impersonatedOrgId } = useImpersonationStore.getState();

  const headers = new Headers(init?.headers);
  if (impersonatedOrgId && !headers.has("x-impersonate-org-id")) {
    headers.set("x-impersonate-org-id", impersonatedOrgId);
  }

  return fetch(input, { ...init, headers });
}
