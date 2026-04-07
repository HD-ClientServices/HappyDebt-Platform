"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/store/ui-store";
import {
  Users,
  LayoutDashboard,
  Brain,
  ListTodo,
  Settings,
  Shield,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const navItems = [
  { href: "/dashboard/leads", label: "Leads Overview", icon: Users },
  { href: "/dashboard/live-transfers", label: "Live Transfers", icon: LayoutDashboard },
  { href: "/dashboard/closing-intelligence", label: "Closing Intelligence", icon: Brain },
  { href: "/dashboard/actionables", label: "Actionables", icon: ListTodo },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

interface SidebarProps {
  userEmail?: string;
}

export function Sidebar({ userEmail }: SidebarProps) {
  const pathname = usePathname();
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);

  const isHappyDebtAdmin =
    userEmail &&
    (userEmail.includes("happydebt.com") || userEmail.includes("tryintro.com"));

  return (
    <aside
      className={cn(
        "flex flex-col border-r border-zinc-800 bg-zinc-900/80 transition-[width] duration-200",
        collapsed ? "w-[60px]" : "w-[240px]"
      )}
    >
      <div className="flex h-14 items-center border-b border-zinc-800 px-3">
        {!collapsed && (
          <span className="font-heading font-semibold text-lg text-foreground">
            HappyDebt
          </span>
        )}
      </div>
      <nav className="flex-1 space-y-1 p-2">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-zinc-800 text-foreground"
                  : "text-muted-foreground hover:bg-zinc-800/50 hover:text-foreground"
              )}
            >
              <Icon className="h-5 w-5 shrink-0" />
              {!collapsed && <span>{label}</span>}
            </Link>
          );
        })}

        {isHappyDebtAdmin && (
          <>
            <div className="my-2 border-t border-zinc-800" />
            <Link
              href="/dashboard/admin"
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                pathname.startsWith("/dashboard/admin")
                  ? "bg-zinc-800 text-foreground"
                  : "text-muted-foreground hover:bg-zinc-800/50 hover:text-foreground"
              )}
            >
              <Shield className="h-5 w-5 shrink-0" />
              {!collapsed && <span>Admin</span>}
            </Link>
          </>
        )}
      </nav>
      <div className="border-t border-zinc-800 p-2">
        <Button
          variant="ghost"
          size="icon-sm"
          className="w-full"
          onClick={toggleSidebar}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>
      </div>
    </aside>
  );
}
