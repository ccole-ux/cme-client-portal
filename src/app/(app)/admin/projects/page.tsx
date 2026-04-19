import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Projects — CME Client Portal" };

export default async function AdminProjectsPage() {
  const supabase = await createClient();
  const { data: projects } = await supabase
    .from("projects")
    .select("id, name, client_name, slug, status, baseline_year, kickoff_on")
    .order("created_at", { ascending: false });

  return (
    <div className="p-8 max-w-5xl">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="font-display tracking-[0.25em] text-cme-bright-green text-xs">
            CME CONSOLE · PROJECTS
          </p>
          <h1 className="font-display tracking-wider text-cme-dark-green text-3xl mt-1">
            PROJECTS
          </h1>
        </div>
        <Button
          className="bg-cme-bright-green hover:bg-cme-bright-green/90"
          disabled
          title="Wired up in Session 3"
        >
          Create project (Session 3)
        </Button>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="font-display tracking-wider">
            ALL PROJECTS
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Baseline year</TableHead>
                <TableHead>Kickoff</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(projects ?? []).map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell>{p.client_name}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {p.slug}
                  </TableCell>
                  <TableCell>{p.baseline_year}</TableCell>
                  <TableCell>{p.kickoff_on ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {p.status.replace("_", " ")}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              {(!projects || projects.length === 0) && (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center text-muted-foreground py-8"
                  >
                    No projects yet. Session 3 adds the ACTC PCS seed.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
