"use client";

import { EvaluationTemplateEditor } from "./EvaluationTemplateEditor";
import { OrgSettings } from "./OrgSettings";
import { GHLIntegrationSettings } from "./GHLIntegrationSettings";

interface SettingsContentProps {
  userRole?: string;
}

export function SettingsContent({ userRole }: SettingsContentProps) {
  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-semibold">Settings</h1>
      <GHLIntegrationSettings />
      <OrgSettings />
      <EvaluationTemplateEditor userRole={userRole} />
    </div>
  );
}
