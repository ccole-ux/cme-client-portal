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
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Snapshots — CME Client Portal" };

export default async function AdminSnapshotsPage() {
  const supabase = await createClient();
  const { data: snapshots } = await supabase
    .from("workplan_snapshots")
    .select(
      "id, project_id, snapshot_type, snapshot_label, version_number, captured_at",
    )
    .order("captured_at", { ascending: false })
    .limit(50);

  return (
    <div className="p-8 max-w-5xl">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="font-display tracking-[0.25em] text-cme-bright-green text-xs">
            CME CONSOLE · SNAPSHOTS
          </p>
          <h1 className="font-display tracking-wider text-cme-dark-green text-3xl mt-1">
            SNAPSHOTS
          </h1>
        </div>
        <Button
          className="bg-cme-bright-green hover:bg-cme-bright-green/90"
          disabled
          title="Manual capture wired up in Session 6"
        >
          Capture manual snapshot (Session 6)
        </Button>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="font-display tracking-wider">
            RECENT SNAPSHOTS
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Label</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Captured</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(snapshots ?? []).map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <Badge variant="outline">
                      {s.snapshot_type.replace("_", " ")}
                    </Badge>
                  </TableCell>
                  <TableCell>{s.snapshot_label ?? "—"}</TableCell>
                  <TableCell className="tabular-nums">
                    v{s.version_number}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(s.captured_at).toLocaleString()}
                  </TableCell>
                </TableRow>
              ))}
              {(!snapshots || snapshots.length === 0) && (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="text-center text-muted-foreground py-8"
                  >
                    No snapshots yet. Session 3 captures the initial v8 baseline
                    once the ACTC PCS workplan is seeded.
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
