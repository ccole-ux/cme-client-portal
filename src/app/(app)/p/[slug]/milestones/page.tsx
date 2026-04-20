import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  getProjectBySlugOrNotFound,
  getTasksWithCosts,
} from "@/lib/projects/queries";
import { StatusBadge } from "@/components/status/StatusBadge";
import { formatDate } from "@/lib/status";

export const metadata = { title: "Milestones — CME Client Portal" };

export default async function MilestonesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const project = await getProjectBySlugOrNotFound(slug);
  const all = await getTasksWithCosts(project.id);
  const milestones = all
    .filter((t) => t.task.is_milestone)
    .sort((a, b) =>
      (a.task.finish_date ?? "").localeCompare(b.task.finish_date ?? ""),
    );

  return (
    <div className="max-w-7xl px-8 py-6 space-y-6">
      <div>
        <p className="font-display tracking-[0.25em] text-cme-bright-green text-xs">
          WORKPLAN
        </p>
        <h2 className="font-display tracking-wider text-cme-dark-green text-xl mt-1">
          MILESTONES
        </h2>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="font-display tracking-wide">
            {milestones.length} MILESTONES
          </CardTitle>
          <CardDescription>
            Gate milestones for the PCS v8 workplan, May 2026 through April
            2027.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Milestone</TableHead>
                <TableHead>Target date</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {milestones.map((m) => (
                <TableRow key={m.task.id}>
                  <TableCell className="font-mono text-xs">
                    {m.task.wbs}
                  </TableCell>
                  <TableCell>{m.task.task_name}</TableCell>
                  <TableCell>{formatDate(m.task.finish_date)}</TableCell>
                  <TableCell>
                    <StatusBadge status={m.task.status} />
                  </TableCell>
                </TableRow>
              ))}
              {milestones.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="text-center text-sm text-muted-foreground py-8"
                  >
                    No milestones seeded yet.
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
