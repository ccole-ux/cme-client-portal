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
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Audit log — CME Client Portal" };

type SearchParams = Promise<{ page?: string; actor?: string; action?: string }>;

const PAGE_SIZE = 50;

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { page, actor, action } = await searchParams;
  const pageNumber = Math.max(1, Number(page ?? "1"));
  const from = (pageNumber - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const supabase = await createClient();
  const filters: Record<string, string> = {};
  if (actor) filters.actor_id = actor;
  if (action) filters.action = action;

  const { data: entries, count } = await supabase
    .from("audit_log")
    .select(
      "id, action, entity_type, entity_id, actor_id, project_id, created_at",
      { count: "exact" },
    )
    .match(filters)
    .order("created_at", { ascending: false })
    .range(from, to);
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="p-8 max-w-6xl">
      <header className="mb-6">
        <p className="font-display tracking-[0.25em] text-cme-bright-green text-xs">
          CME CONSOLE · AUDIT LOG
        </p>
        <h1 className="font-display tracking-wider text-cme-dark-green text-3xl mt-1">
          AUDIT LOG
        </h1>
        <p className="text-sm text-muted-foreground mt-2">
          {total.toLocaleString()} total entries · page {pageNumber} of{" "}
          {totalPages}
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="font-display tracking-wider">
            RECENT ACTIVITY
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Entity ID</TableHead>
                <TableHead>Actor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(entries ?? []).map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(e.created_at).toLocaleString()}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {e.action}
                  </TableCell>
                  <TableCell>{e.entity_type}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground truncate max-w-[12ch]">
                    {e.entity_id ?? "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground truncate max-w-[12ch]">
                    {e.actor_id ?? "system"}
                  </TableCell>
                </TableRow>
              ))}
              {(!entries || entries.length === 0) && (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-center text-muted-foreground py-8"
                  >
                    No audit entries yet.
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
