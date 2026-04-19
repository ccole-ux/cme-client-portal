"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { LogoMark } from "@/components/brand/LogoMark";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { UserGlobalRole } from "@/lib/supabase/types";

type NavLink = { href: string; label: string; cmeAdminOnly?: boolean };

const LINKS: NavLink[] = [
  { href: "/", label: "Home" },
  { href: "/admin", label: "Admin", cmeAdminOnly: true },
  { href: "/ai", label: "AI Assistant" },
];

type Props = {
  profile: {
    full_name: string | null;
    email: string;
    role: UserGlobalRole;
  };
};

export function AppSidebar({ profile }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const isAdmin = profile.role === "cme_admin";
  const displayName = profile.full_name ?? profile.email;
  const initials = displayName
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  function handleSignOut() {
    startTransition(async () => {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push("/login");
      router.refresh();
    });
  }

  return (
    <aside className="bg-sidebar text-sidebar-foreground w-60 shrink-0 flex flex-col border-r border-sidebar-border">
      <div className="p-5 flex items-center gap-3">
        <LogoMark size={32} />
        <div className="leading-tight">
          <p className="font-display tracking-wider text-sm">CME</p>
          <p className="font-display tracking-widest text-[10px] text-sidebar-foreground/70">
            CLIENT PORTAL
          </p>
        </div>
      </div>

      <Separator className="bg-sidebar-border" />

      <nav className="flex-1 py-4 px-3 space-y-1">
        {LINKS.filter((l) => !l.cmeAdminOnly || isAdmin).map((link) => {
          const active =
            link.href === "/"
              ? pathname === "/"
              : pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "block px-3 py-2 rounded-md text-sm",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground",
              )}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>

      <Separator className="bg-sidebar-border" />

      <div className="p-3">
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-3 w-full px-2 py-2 rounded-md hover:bg-sidebar-accent/70 text-left">
            <span className="h-9 w-9 rounded-full bg-cme-yellow text-cme-black font-display text-sm flex items-center justify-center">
              {initials || "?"}
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm truncate">{displayName}</span>
              <span className="block text-[11px] text-sidebar-foreground/60 truncate">
                {profile.role.replace("_", " ")}
              </span>
            </span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top" className="w-56">
            <DropdownMenuLabel className="truncate">
              {profile.email}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={handleSignOut} disabled={pending}>
              {pending ? "Signing out…" : "Sign out"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  );
}
