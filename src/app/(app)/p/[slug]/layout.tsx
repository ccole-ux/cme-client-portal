import Link from "next/link";
import { getProjectBySlugOrNotFound } from "@/lib/projects/queries";
import { ProjectTabs } from "./ProjectTabs";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const project = await getProjectBySlugOrNotFound(slug);

  return (
    <div className="flex flex-col min-h-screen">
      <header className="border-b bg-white">
        <div className="max-w-7xl px-8 py-5">
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
        <ProjectTabs slug={slug} />
      </header>
      <main className="flex-1 bg-background">{children}</main>
    </div>
  );
}
