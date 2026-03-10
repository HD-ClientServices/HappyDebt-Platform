"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

const pathLabels: Record<string, string> = {
  overview: "Overview",
  voc: "Voice of Customer",
  actionables: "Actionables",
  settings: "Settings",
};

function Breadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);
  const dashboardIndex = segments.indexOf("dashboard");
  const afterDashboard =
    dashboardIndex >= 0 ? segments.slice(dashboardIndex + 1) : segments;
  const label =
    afterDashboard.length > 0
      ? pathLabels[afterDashboard[0]] ?? afterDashboard[0]
      : "Dashboard";

  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <Link href="/dashboard" className="hover:text-foreground">
        Dashboard
      </Link>
      {afterDashboard.length > 0 && (
        <>
          <span>/</span>
          <span className="text-foreground font-medium">{label}</span>
        </>
      )}
    </div>
  );
}

export function Topbar({ user }: { user: { email?: string; avatar_url?: string } | null }) {
  const router = useRouter();
  const supabase = createClient();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <header className="flex h-14 items-center justify-between border-b border-zinc-800 bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <Breadcrumbs />
      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
            <Avatar className="h-8 w-8">
              <AvatarImage src={user?.avatar_url} alt="" />
              <AvatarFallback className="bg-zinc-800 text-xs">
                {(user?.email ?? "U").slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="hidden text-sm md:inline">{user?.email}</span>
            <ChevronDown className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 bg-zinc-900 border-zinc-800">
            <DropdownMenuItem onClick={handleSignOut} className="text-rose-500">
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
