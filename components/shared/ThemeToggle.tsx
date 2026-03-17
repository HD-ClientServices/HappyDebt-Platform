"use client";

import { useUIStore } from "@/store/ui-store";
import { Sun, Moon } from "lucide-react";
import { useEffect } from "react";

export function ThemeToggle() {
  const { theme, toggleTheme } = useUIStore();

  // Sync data-theme attribute on mount (hydration)
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  return (
    <button
      onClick={toggleTheme}
      className="inline-flex items-center gap-2 px-3 py-1.5 bg-muted border border-border rounded-sm cursor-pointer text-muted-foreground text-xs font-sans transition-colors hover:text-foreground"
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
    >
      {theme === "dark" ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
      {theme === "dark" ? "Dark" : "Light"}
    </button>
  );
}
