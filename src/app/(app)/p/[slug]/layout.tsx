import Link from "next/link";
import { getProjectBySlugOrNotFound } from "@/lib/projects/queries";
import {
  countDraftsForUser,
  countPendingSubmissionsForProject,
} from "@/lib/drafts/queries";
import { getCurrentProfile, getSessionUser } from "@/lib/supabase/dal";
import { ProjectTabs } from "./ProjectTabs";
import { NotificationBell } from "@/components/notifications/NotificationBell";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const project = await getProjectBySlugOrNotFound(slug);
  const profile = await getCurrentProfile();
  const user = await getSessionUser();
  const isCmeAdmin = profile?.role === "cme_admin";
  const canReview =
    profile?.role === "cme_admin" || profile?.role === "cme_reviewer";

  const [draftsCount, pendingReviewCount] = await Promise.all([
    user ? countDraftsForUser(project.id, user.id) : Promise.resolve(0),
    canReview
      ? countPendingSubmissionsForProject(project.id)
      : Promise.resolve(0),
  ]);

  return (
    <div className="flex flex-col min-h-screen">
      <header className="border-b bg-white">
        <div className="max-w-7xl px-8 py-5 flex items-start justify-between gap-4">
          <div>
            <nav className="text-[11px] tracking-widest uppercase text-muted-foreground mb-1">
              <Link href="/" className="hover:text-cme-dark-green">
                Home
              </Link>
              <span className="mx-2">/</span>
              <span>{project.client_short}</span>
            </nav>
            <h1 className="font-display tracking-wider text-cme-dark-green text-2xl">
              {project.name.toUpperCase()}
            </h1>
            <p className="text-sm text-muted-foreground">
              {project.client_name}
            </p>
          </div>
          <NotificationBell />
        </div>
        <ProjectTabs
          slug={slug}
          isCmeAdmin={isCmeAdmin}
          canReview={canReview}
          draftsCount={draftsCount}
          pendingReviewCount={pendingReviewCount}
        />
      </header>
      <main className="flex-1 bg-background">{children}</main>
    </div>
  );
}
