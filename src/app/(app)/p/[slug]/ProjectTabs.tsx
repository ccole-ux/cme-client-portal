"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { suffix: "", label: "Overview" },
  { suffix: "/tasks", label: "Tasks" },
  { suffix: "/resources", label: "Resources" },
  { suffix: "/milestones", label: "Milestones" },
];

export function ProjectTabs({ slug }: { slug: string }) {
  const pathname = usePathname();
  const base = `/p/${slug}`;
  return (
    <div className="max-w-7xl px-8">
      <nav className="flex gap-1 border-b -mb-px">
        {TABS.map((t) => {
          const href = base + t.suffix;
          const active =
            t.suffix === ""
              ? pathname === base
              : pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={t.suffix}
              href={href}
              className={cn(
                "px-4 py-3 text-sm font-medium border-b-2 transition-colors",
                active
                  ? "border-cme-bright-green text-cme-dark-green"
                  : "border-transparent text-muted-foreground hover:text-cme-dark-green",
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
