import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }
  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "happydebt_admin") {
    redirect("/dashboard");
  }
  return (
    <div className="min-h-screen bg-background p-6">
      <nav className="mb-6 flex gap-4">
        <a href="/admin/design-system" className="text-sm font-medium text-muted-foreground hover:text-foreground">
          Design System
        </a>
        <a href="/admin/plg" className="text-sm font-medium text-muted-foreground hover:text-foreground">
          PLG
        </a>
        <a href="/admin/orgs" className="text-sm font-medium text-muted-foreground hover:text-foreground">
          Orgs
        </a>
      </nav>
      {children}
    </div>
  );
}
