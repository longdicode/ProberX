"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { useUiStore } from "@/stores/ui-store";
import { useAuthStore } from "@/stores/auth-store";
import { useLocale } from "@/stores/locale-store";
import { Search, Sun, Moon, Monitor, LogOut, User, PanelLeftOpen, Command } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { LocaleSwitcher } from "./locale-switcher";

export function Header() {
  const { theme, setTheme } = useTheme();
  const { toggleSidebar, sidebarOpen, toggleCommandPalette } = useUiStore();
  const { user, logout } = useAuthStore();
  const { t } = useLocale();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const initials = user?.name?.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2) || "U";

  return (
    <header className="sticky top-0 z-30 h-14 glass border-b border-border/40 flex items-center justify-between px-4">
      <div className="flex items-center gap-3">
        {!sidebarOpen && (
          <Button variant="ghost" size="icon" onClick={toggleSidebar}>
            <PanelLeftOpen className="w-5 h-5" />
          </Button>
        )}
        <button onClick={toggleCommandPalette} className="flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground bg-muted/50 hover:bg-muted rounded-lg border border-border/50 transition-colors">
          <Search className="w-4 h-4" />
          <span className="hidden sm:inline">{t("header.searchPlaceholder")}</span>
          <kbd className="hidden sm:inline-flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded bg-background border"><Command className="w-3 h-3" />K</kbd>
        </button>
      </div>

      <div className="flex items-center gap-2">
        <LocaleSwitcher />
        {mounted && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              if (theme === "dark") setTheme("light");
              else if (theme === "light") setTheme("system");
              else setTheme("dark");
            }}
            title={theme === "dark" ? "Dark" : theme === "light" ? "Light" : "System"}
          >
            {theme === "dark" ? <Moon className="w-5 h-5" /> : theme === "light" ? <Sun className="w-5 h-5" /> : <Monitor className="w-5 h-5" />}
          </Button>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger className="rounded-full">
            <Avatar className="w-8 h-8">
              <AvatarFallback className="text-xs bg-primary/10 text-primary">{initials}</AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuGroup>
              <DropdownMenuLabel>
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">{user?.name || t("header.userFallback")}</span>
                  <span className="text-xs text-muted-foreground">{user?.email}</span>
                </div>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem><User className="w-4 h-4 mr-2" /> {t("header.profile")}</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout} className="text-destructive">
              <LogOut className="w-4 h-4 mr-2" /> {t("header.signOut")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
