import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Admin impersonation store.
 *
 * Allows staff users (intro_admin) to view the app as if they were a member
 * of any organization. The selected org is persisted to localStorage so it
 * survives refreshes, and is cleared on explicit logout.
 *
 * SECURITY: This is a client-side UX convenience. The actual permission
 * check happens server-side in `lib/auth/getEffectiveOrgId.ts` and in RLS
 * policies via `is_intro_admin()`. A non-admin user who tries to set an
 * impersonation will not gain any data access — the backend ignores the
 * header if the caller is not an admin.
 */
interface ImpersonationState {
  impersonatedOrgId: string | null;
  impersonatedOrgName: string | null;
  setImpersonation: (orgId: string, orgName: string) => void;
  clearImpersonation: () => void;
}

export const useImpersonationStore = create<ImpersonationState>()(
  persist(
    (set) => ({
      impersonatedOrgId: null,
      impersonatedOrgName: null,
      setImpersonation: (orgId, orgName) =>
        set({ impersonatedOrgId: orgId, impersonatedOrgName: orgName }),
      clearImpersonation: () =>
        set({ impersonatedOrgId: null, impersonatedOrgName: null }),
    }),
    { name: "intro-impersonation" }
  )
);
