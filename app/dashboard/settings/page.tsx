import { EvaluationTemplateEditor } from "./EvaluationTemplateEditor";
import { OrgSettings } from "./OrgSettings";
import { GHLIntegrationSettings } from "./GHLIntegrationSettings";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-semibold">Settings</h1>
      <GHLIntegrationSettings />
      <OrgSettings />
      <EvaluationTemplateEditor />
    </div>
  );
}
