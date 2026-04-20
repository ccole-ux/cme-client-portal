import type { ExportWorkplan } from "./workplan-data";

/**
 * Flat CSV, one row per (task × resource assignment). Milestones emit one
 * row with empty resource fields.
 */
export function renderWorkplanCsv(wp: ExportWorkplan): string {
  const header = [
    "wbs",
    "task_name",
    "phase",
    "start_date",
    "finish_date",
    "is_milestone",
    "resource_name",
    "firm",
    "rate_year",
    "rate",
    "hours",
    "cost",
    "status",
    "notes",
  ];
  const rows: string[] = [header.map(csvEscape).join(",")];

  for (const t of wp.tasks) {
    if (t.assignments.length === 0) {
      rows.push(
        [
          t.wbs,
          t.task_name,
          t.phase ?? "",
          t.start_date ?? "",
          t.finish_date ?? "",
          t.is_milestone ? "TRUE" : "FALSE",
          "",
          "",
          "",
          "",
          "",
          "",
          t.status,
          t.notes ?? "",
        ]
          .map(csvEscape)
          .join(","),
      );
      continue;
    }
    for (const a of t.assignments) {
      rows.push(
        [
          t.wbs,
          t.task_name,
          t.phase ?? "",
          t.start_date ?? "",
          t.finish_date ?? "",
          t.is_milestone ? "TRUE" : "FALSE",
          a.resource_name,
          a.firm,
          a.rate_year != null ? String(a.rate_year) : "",
          a.rate != null ? a.rate.toFixed(2) : "",
          a.hours.toFixed(2),
          a.cost.toFixed(2),
          t.status,
          t.notes ?? "",
        ]
          .map(csvEscape)
          .join(","),
      );
    }
  }

  return rows.join("\n") + "\n";
}

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
