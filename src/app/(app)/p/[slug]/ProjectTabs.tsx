"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

type TabDef = {
  suffix: string;
  label: string;
  badge?: number;
  reviewerOnly?: boolean;
  cmeAdminOnly?: boolean;
};

export function ProjectTabs({
  slug,
  isCmeAdmin,
  canReview,
  draftsCount,
  pendingReviewCount,
}: {
  slug: string;
  isCmeAdmin: boolean;
  canReview: boolean;
  draftsCount: number;
  pendingReviewCount: number;
}) {
  const pathname = usePathname();
  const base = `/p/${slug}`;

  const tabs: TabDef[] = [
    { suffix: "", label: "Overview" },
    { suffix: "/tasks", label: "Tasks" },
    { suffix: "/gantt", label: "Gantt" },
    { suffix: "/costs", label: "Costs" },
    { suffix: "/resources", label: "Resources" },
    { suffix: "/milestones", label: "Milestones" },
    { suffix: "/drafts", label: "Drafts", badge: draftsCount },
    { suffix: "/submissions", label: "Submissions" },
    {
      suffix: "/review",
      label: "Review",
      badge: pendingReviewCount,
      reviewerOnly: true,
    },
    { suffix: "/versions", label: "Versions" },
    { suffix: "/documents", label: "Documents" },
    { suffix: "/activity", label: "Activity" },
  ];

  return (
    <div className="max-w-7xl px-8">
      <nav className="flex gap-1 border-b -mb-px overflow-x-auto">
        {tabs
          .filter((t) => {
            if (t.reviewerOnly && !canReview) return false;
            if (t.cmeAdminOnly && !isCmeAdmin) return false;
            return true;
          })
          .map((t) => {
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
                  "relative px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                  active
                    ? "border-cme-bright-green text-cme-dark-green"
                    : "border-transparent text-muted-foreground hover:text-cme-dark-green",
                )}
              >
                {t.label}
                {t.badge ? (
                  <span
                    className={cn(
                      "ml-1.5 inline-flex items-center justify-center rounded-full px-1.5 py-px text-[10px] font-semibold",
                      t.suffix === "/drafts"
                        ? "bg-cme-yellow text-cme-black"
                        : "bg-cme-red/15 text-cme-red",
                    )}
                  >
                    {t.badge}
                  </span>
                ) : null}
              </Link>
            );
          })}
      </nav>
    </div>
  );
}
