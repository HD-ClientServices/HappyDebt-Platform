"use client";

import { EvaluationTemplateEditor } from "./EvaluationTemplateEditor";
import { GHLIntegrationSettings } from "./GHLIntegrationSettings";
import { OrgSettings } from "./OrgSettings";
import { InviteCollaborators } from "@/components/settings/InviteCollaborators";

interface SettingsContentProps {
  userRole?: string;
}

export function SettingsContent({ userRole }: SettingsContentProps) {
  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-semibold">Settings</h1>
      <OrgSettings />
      <InviteCollaborators />
      <GHLIntegrationSettings />
      <EvaluationTemplateEditor userRole={userRole} />
    </div>
  );
}
