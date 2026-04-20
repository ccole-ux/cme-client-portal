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
import { createClient } from "@/lib/supabase/server";
import { requireCmeAdmin } from "@/lib/supabase/dal";
import { formatCurrencyCents, formatDate } from "@/lib/status";
import { EditRateButton } from "./EditRateButton";

export const metadata = { title: "Rates — CME Client Portal" };

export default async function AdminRatesPage() {
  await requireCmeAdmin();
  const supabase = await createClient();

  const [ratesRes, resourcesRes] = await Promise.all([
    supabase
      .from("resource_rate_history")
      .select("*")
      .order("effective_from"),
    supabase.from("resources").select("*").order("full_name"),
  ]);

  const rates = ratesRes.data ?? [];
  const resources = resourcesRes.data ?? [];
  const resourceById = new Map(resources.map((r) => [r.id, r]));

  // Sort rates grouped by resource, ascending by effective_from.
  const grouped = new Map<
    string,
    { resource: (typeof resources)[number]; rows: typeof rates }
  >();
  for (const r of rates) {
    const res = resourceById.get(r.resource_id);
    if (!res) continue;
    const g = grouped.get(r.resource_id) ?? { resource: res, rows: [] };
    g.rows.push(r);
    grouped.set(r.resource_id, g);
  }

  const groups = [...grouped.values()].sort((a, b) =>
    a.resource.full_name.localeCompare(b.resource.full_name),
  );

  return (
    <div className="p-8 max-w-6xl space-y-6">
      <header>
        <p className="font-display tracking-[0.25em] text-cme-bright-green text-xs">
          CME CONSOLE · RATES
        </p>
        <h1 className="font-display tracking-wider text-cme-dark-green text-3xl mt-1">
          RATES
        </h1>
        <p className="text-sm text-muted-foreground mt-2">
          Date-effective loaded rates. Escalation defaults to 3% on Jan 1 per
          calendar year. Edits take effect on next read (task costs recompute
          lazily).
        </p>
      </header>

      {groups.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-8 text-sm text-muted-foreground text-center">
            No rate history seeded yet. Run the Session 3 seed script.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="font-display tracking-wide">
              {rates.length} RATE ROWS · {groups.length} RESOURCES
            </CardTitle>
            <CardDescription>B7 R26-003 2026 + escalations</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Resource</TableHead>
                  <TableHead>Year</TableHead>
                  <TableHead>Effective from</TableHead>
                  <TableHead>Effective to</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.flatMap((g) =>
                  g.rows.map((r, idx) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">
                        {idx === 0 ? g.resource.full_name : ""}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {r.effective_from.slice(0, 4)}
                      </TableCell>
                      <TableCell>{formatDate(r.effective_from)}</TableCell>
                      <TableCell>{formatDate(r.effective_to)}</TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrencyCents(Number(r.rate_loaded))}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.rate_source ?? "—"}
                      </TableCell>
                      <TableCell>
                        <EditRateButton
                          rateId={r.id}
                          resourceName={g.resource.full_name}
                          year={r.effective_from.slice(0, 4)}
                          currentRate={Number(r.rate_loaded)}
                        />
                      </TableCell>
                    </TableRow>
                  )),
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
