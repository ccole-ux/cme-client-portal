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
import {
  formatCurrency,
  formatDate,
  TASK_STATUS_LABEL,
  type TaskStatus,
} from "@/lib/status";
import { TaskFilters } from "./TaskFilters";
import { DownloadMenu } from "@/components/export/DownloadMenu";

export const metadata = { title: "Tasks — CME Client Portal" };

const PHASES = ["1", "1.5", "2", "3", "PM"] as const;
const STATUSES: TaskStatus[] = [
  "not_started",
  "in_development",
  "submitted_for_review",
  "accepted",
  "rejected",
  "deferred",
];

export default async function TasksPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    phase?: string;
    status?: string;
    q?: string;
  }>;
}) {
  const { slug } = await params;
  const filters = await searchParams;
  const project = await getProjectBySlugOrNotFound(slug);
  const all = await getTasksWithCosts(project.id);

  const q = (filters.q ?? "").toLowerCase();
  const selectedPhase = filters.phase ?? "all";
  const selectedStatus = filters.status ?? "all";

  const filtered = all.filter((t) => {
    if (t.task.is_milestone) return false;
    if (selectedPhase !== "all" && t.task.phase !== selectedPhase) return false;
    if (selectedStatus !== "all" && t.task.status !== selectedStatus)
      return false;
    if (q) {
      const hay = `${t.task.wbs} ${t.task.task_name}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const totalHours = filtered.reduce((s, t) => s + t.total_hours, 0);
  const totalCost = filtered.reduce((s, t) => s + t.total_cost, 0);

  return (
    <div className="max-w-7xl px-8 py-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-display tracking-[0.25em] text-cme-bright-green text-xs">
            WORKPLAN
          </p>
          <h2 className="font-display tracking-wider text-cme-dark-green text-xl mt-1">
            TASKS
          </h2>
        </div>
        <DownloadMenu slug={slug} scope="canonical" />
      </div>

      <TaskFilters
        slug={slug}
        phases={[...PHASES]}
        statuses={STATUSES.map((s) => ({ value: s, label: TASK_STATUS_LABEL[s] }))}
        initial={{
          phase: selectedPhase,
          status: selectedStatus,
          q: filters.q ?? "",
        }}
      />

      <Card>
        <CardHeader>
          <CardTitle className="font-display tracking-wide">
            {filtered.length} TASKS ·{" "}
            {totalHours.toLocaleString(undefined, {
              maximumFractionDigits: 0,
            })}{" "}
            HRS · {formatCurrency(totalCost)}
          </CardTitle>
          <CardDescription>
            Cost rolls up all resource assignments using date-effective rates.
            Click a row for detail (drawer in Session 4).
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>WBS</TableHead>
                <TableHead>Task</TableHead>
                <TableHead>Phase</TableHead>
                <TableHead>Start</TableHead>
                <TableHead>Finish</TableHead>
                <TableHead className="text-right">Hours</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((t) => (
                <TableRow key={t.task.id}>
                  <TableCell className="font-mono text-xs">
                    {t.task.wbs}
                  </TableCell>
                  <TableCell className="max-w-md truncate">
                    {t.task.task_name}
                  </TableCell>
                  <TableCell>{t.task.phase ?? "—"}</TableCell>
                  <TableCell>{formatDate(t.task.start_date)}</TableCell>
                  <TableCell>{formatDate(t.task.finish_date)}</TableCell>
                  <TableCell className="text-right">
                    {t.total_hours.toLocaleString(undefined, {
                      maximumFractionDigits: 0,
                    })}
                  </TableCell>
                  <TableCell className="text-right">
                    {t.rate_missing
                      ? "—"
                      : formatCurrency(t.total_cost)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={t.task.status} />
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="text-center text-sm text-muted-foreground py-8"
                  >
                    No tasks match the current filters.
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
