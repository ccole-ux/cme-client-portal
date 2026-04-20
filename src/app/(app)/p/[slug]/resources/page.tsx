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
  getResourcesForProject,
} from "@/lib/projects/queries";
import { formatCurrency, formatCurrencyCents } from "@/lib/status";

export const metadata = { title: "Resources — CME Client Portal" };

export default async function ResourcesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const project = await getProjectBySlugOrNotFound(slug);
  const rows = await getResourcesForProject(project.id);

  const assigned = rows.filter((r) => r.total_hours > 0);
  const totalHours = assigned.reduce((s, r) => s + r.total_hours, 0);
  const totalCost = assigned.reduce((s, r) => s + r.total_cost, 0);

  return (
    <div className="max-w-7xl px-8 py-6 space-y-6">
      <div>
        <p className="font-display tracking-[0.25em] text-cme-bright-green text-xs">
          WORKPLAN
        </p>
        <h2 className="font-display tracking-wider text-cme-dark-green text-xl mt-1">
          RESOURCES
        </h2>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="font-display tracking-wide">
            {assigned.length} RESOURCES · {totalHours.toLocaleString()} HRS ·{" "}
            {formatCurrency(totalCost)}
          </CardTitle>
          <CardDescription>
            Rate timeline shows calendar-year escalations. Click a row for
            details (drawer in Session 4).
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Firm</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Rate timeline</TableHead>
                <TableHead className="text-right">Hours assigned</TableHead>
                <TableHead className="text-right">Total cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.resource.id}>
                  <TableCell className="font-medium">
                    {r.resource.full_name}
                  </TableCell>
                  <TableCell>{r.resource.firm}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {r.resource.role_description ?? "—"}
                  </TableCell>
                  <TableCell>
                    <RateTimeline rates={r.rates} />
                  </TableCell>
                  <TableCell className="text-right">
                    {r.total_hours.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(r.total_cost)}
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center text-sm text-muted-foreground py-8"
                  >
                    No resources seeded yet.
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

function RateTimeline({
  rates,
}: {
  rates: { effective_from: string; rate_loaded: number; rate_source: string | null }[];
}) {
  const sorted = [...rates].sort((a, b) =>
    a.effective_from < b.effective_from ? -1 : 1,
  );
  return (
    <div className="flex gap-2 text-xs">
      {sorted.map((r) => {
        const year = r.effective_from.slice(0, 4);
        return (
          <div
            key={r.effective_from}
            className="rounded-md border px-2 py-1 bg-muted/40"
            title={r.rate_source ?? ""}
          >
            <div className="font-semibold">{year}</div>
            <div>{formatCurrencyCents(Number(r.rate_loaded))}</div>
          </div>
        );
      })}
      {sorted.length === 0 && (
        <span className="text-muted-foreground">—</span>
      )}
    </div>
  );
}
