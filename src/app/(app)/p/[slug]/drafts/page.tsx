import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getProjectBySlugOrNotFound } from "@/lib/projects/queries";
import { getSessionUser } from "@/lib/supabase/dal";
import { getDraftsForUser, summarizeChange } from "@/lib/drafts/queries";
import { formatDate } from "@/lib/status";
import { DraftRowActions } from "./DraftRowActions";
import { SubmitDraftsForm } from "./SubmitDraftsForm";

export const metadata = { title: "Drafts — CME Client Portal" };

export default async function DraftsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const project = await getProjectBySlugOrNotFound(slug);
  const user = await getSessionUser();
  if (!user) return null;
  const drafts = await getDraftsForUser(project.id, user.id);

  const groups = new Map<string, typeof drafts>();
  for (const d of drafts) {
    const key = keyFor(d.entity_type, d.operation);
    const list = groups.get(key) ?? [];
    list.push(d);
    groups.set(key, list);
  }

  return (
    <div className="max-w-7xl px-8 py-6 space-y-6">
      <div className="flex items-start justify-between gap-6">
        <div>
          <p className="font-display tracking-[0.25em] text-cme-bright-green text-xs">
            PROPOSED CHANGES
          </p>
          <h2 className="font-display tracking-wider text-cme-dark-green text-xl mt-1">
            YOUR DRAFTS ({drafts.length})
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Only you and CME Admins can see these drafts until you submit them
            for review.
          </p>
        </div>
      </div>

      {drafts.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            You have no pending drafts on this project. Drag a task on the
            Gantt or edit dates in the task drawer to create one.
          </CardContent>
        </Card>
      ) : (
        <>
          {Array.from(groups.entries()).map(([groupKey, rows]) => (
            <Card key={groupKey}>
              <CardHeader>
                <CardTitle className="font-display tracking-wide text-sm">
                  {labelForGroup(groupKey)}
                  <span className="text-muted-foreground font-sans font-normal ml-2">
                    · {rows.length}
                  </span>
                </CardTitle>
                <CardDescription className="text-xs">
                  Each row bundles into a single submission when you click
                  Submit below.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <ul className="divide-y border-t">
                  {rows.map((r) => {
                    const diffs = summarizeChange(r.operation, r.change_data);
                    return (
                      <li
                        key={r.id}
                        className="px-5 py-3 grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto_auto] gap-4 items-start"
                      >
                        <div className="min-w-0">
                          {r.entity.sub && (
                            <p className="font-mono text-[10px] text-muted-foreground">
                              {r.entity.sub}
                            </p>
                          )}
                          <p className="text-sm truncate font-medium">
                            {r.entity.label}
                          </p>
                        </div>
                        <div className="space-y-0.5 text-xs">
                          {diffs.map((d, i) => (
                            <div
                              key={`${r.id}-${d.field}-${i}`}
                              className="flex items-baseline gap-2"
                            >
                              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground w-24 shrink-0">
                                {d.field}
                              </span>
                              <span className="text-muted-foreground line-through truncate">
                                {d.old}
                              </span>
                              <span className="text-muted-foreground">→</span>
                              <span className="text-cme-dark-green truncate">
                                {d.new}
                              </span>
                            </div>
                          ))}
                        </div>
                        <div className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatDate(r.created_at)}
                        </div>
                        <DraftRowActions id={r.id} />
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          ))}

          <SubmitDraftsForm projectId={project.id} slug={slug} count={drafts.length} />
        </>
      )}
    </div>
  );
}

function keyFor(entityType: string, operation: string): string {
  if (operation === "create") return `${entityType}.create`;
  if (operation === "delete") return `${entityType}.delete`;
  return `${entityType}.update`;
}

function labelForGroup(key: string): string {
  const map: Record<string, string> = {
    "workplan_task.update": "Workplan task edits",
    "workplan_task.create": "New tasks",
    "workplan_task.delete": "Task removals",
    "task_dependency.create": "New dependencies",
    "task_dependency.delete": "Dependency removals",
    "deliverable.update": "Deliverable edits",
    "narrative_section.update": "Narrative edits",
  };
  return map[key] ?? key;
}
