import { createClient } from "@/lib/supabase/server";
import { SettingsContent } from "./SettingsContent";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let userRole: string | undefined;
  if (user) {
    const { data: profile } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();
    userRole = profile?.role ?? undefined;
  }

  return <SettingsContent userRole={userRole} />;
}
