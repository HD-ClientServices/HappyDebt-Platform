"use client";

import { EvaluationTemplateEditor } from "./EvaluationTemplateEditor";
import { OrgSettings } from "./OrgSettings";
import { InviteCollaborators } from "@/components/settings/InviteCollaborators";

interface SettingsContentProps {
  userRole?: string;
}

/**
 * Settings page seen by regular org users (admins of their own org,
 * managers, viewers). It exposes only the things a client should be
 * able to self-serve:
 *   - Organization name / branding
 *   - Invite collaborators via shareable link
 *   - Evaluation template editor (for org admins/managers)
 *
 * ⚠️ Do NOT re-add the Go High Level Integration card here. GHL
 * credentials (API token, location id, pipelines, reconnect webhook)
 * are Intro-staff configuration — end-users shouldn't see raw tokens
 * or be able to break their own sync. That card lives in the Admin
 * panel under the "Organizations" tab → per-org "Configure GHL" button
 * (see `app/dashboard/admin/_panels/OrgConfigDialog.tsx`).
 */
export function SettingsContent({ userRole }: SettingsContentProps) {
  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-semibold">Settings</h1>
      <OrgSettings />
      <InviteCollaborators />
      <EvaluationTemplateEditor userRole={userRole} />
    </div>
  );
}
