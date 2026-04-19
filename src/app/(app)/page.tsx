import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { requireUser, getCurrentProfile } from "@/lib/supabase/dal";

export const metadata = { title: "Portal home — CME Client Portal" };

export default async function HomePage() {
  await requireUser();
  const profile = await getCurrentProfile();
  const supabase = await createClient();

  const { data: projects } = await supabase
    .from("projects")
    .select("id, name, client_name, slug, status")
    .order("created_at", { ascending: false });

  const greeting =
    profile?.full_name?.split(" ")[0] ??
    profile?.email?.split("@")[0] ??
    "there";

  return (
    <div className="p-8 max-w-5xl">
      <header className="mb-8">
        <p className="font-display tracking-[0.25em] text-cme-bright-green text-xs">
          CME CLIENT PORTAL
        </p>
        <h1 className="font-display tracking-wider text-cme-dark-green text-3xl mt-1">
          WELCOME, {greeting.toUpperCase()}
        </h1>
      </header>

      <section>
        <h2 className="font-display tracking-wider text-lg mb-4">
          YOUR PROJECTS
        </h2>
        {projects && projects.length > 0 ? (
          <div className="grid sm:grid-cols-2 gap-4">
            {projects.map((p) => (
              <Link key={p.id} href={`/p/${p.slug}`}>
                <Card className="hover:border-cme-bright-green transition-colors">
                  <CardHeader>
                    <CardTitle className="font-display tracking-wide">
                      {p.name}
                    </CardTitle>
                    <CardDescription>{p.client_name}</CardDescription>
                  </CardHeader>
                  <CardContent className="text-xs text-muted-foreground uppercase tracking-wider">
                    {p.status.replace("_", " ")}
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <Card className="border-dashed">
            <CardContent className="p-8 text-center text-muted-foreground">
              No projects yet. Your first project will appear here once a CME
              admin invites you.
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
