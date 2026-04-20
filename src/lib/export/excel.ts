import ExcelJS from "exceljs";
import type { ExportWorkplan } from "./workplan-data";
import { TASK_STATUS_LABEL } from "@/lib/status";

const DARK_GREEN = "FF25532E";
const BRIGHT_GREEN = "FF3C9D48";
const YELLOW = "FFFFCB0E";
const RED = "FFE85F46";
const GRAY = "FFC7C8CA";

const STATUS_FILL: Record<string, string> = {
  not_started: GRAY,
  in_development: YELLOW,
  submitted_for_review: "FF4B5F9E",
  accepted: BRIGHT_GREEN,
  rejected: RED,
  deferred: "FF52361C",
};

export async function renderWorkplanXlsx(wp: ExportWorkplan): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "CME Client Portal";
  wb.created = new Date();

  buildSummarySheet(wb, wp);
  buildWorkplanSheet(wb, wp);
  buildMilestonesSheet(wb, wp);
  buildResourcesSheet(wb, wp);
  buildRateHistorySheet(wb, wp);
  buildCostAnalysisSheet(wb, wp);

  // exceljs writes a Node buffer when we pass it through the browser shim.
  const ab = await wb.xlsx.writeBuffer();
  return Buffer.from(ab as ArrayBuffer);
}

function buildSummarySheet(wb: ExcelJS.Workbook, wp: ExportWorkplan) {
  const s = wb.addWorksheet("Summary");
  s.properties.defaultRowHeight = 18;

  s.mergeCells("A1:D1");
  const title = s.getCell("A1");
  title.value = `${wp.project.name.toUpperCase()}`;
  title.font = { name: "Oswald", size: 18, bold: true, color: { argb: DARK_GREEN } };
  title.alignment = { vertical: "middle" };
  s.getRow(1).height = 28;

  s.mergeCells("A2:D2");
  s.getCell("A2").value = wp.project.client_name;
  s.getCell("A2").font = { italic: true, size: 11, color: { argb: "FF666666" } };

  s.getCell("A4").value = "Version";
  s.getCell("B4").value = wp.versionLabel;
  s.getCell("A5").value = "Generated";
  s.getCell("B5").value = wp.generatedAt.slice(0, 10);
  s.getCell("A6").value = "Baseline year";
  s.getCell("B6").value = wp.project.baseline_year;
  s.getCell("A7").value = "Kickoff";
  s.getCell("B7").value = wp.project.kickoff_on ?? "—";
  s.getCell("A8").value = "Target complete";
  s.getCell("B8").value = wp.project.target_complete_on ?? "—";

  for (const r of [4, 5, 6, 7, 8]) {
    const c = s.getCell(`A${r}`);
    c.font = { bold: true };
    c.alignment = { horizontal: "left" };
  }

  s.getCell("A10").value = "Total hours";
  s.getCell("B10").value = Math.round(wp.totals.hours);
  s.getCell("A11").value = "Total cost (with escalation)";
  s.getCell("B11").value = wp.totals.cost;
  s.getCell("B11").numFmt = '"$"#,##0';
  s.getCell("A10").font = { bold: true };
  s.getCell("A11").font = { bold: true };

  s.getColumn(1).width = 32;
  s.getColumn(2).width = 28;
}

function buildWorkplanSheet(wb: ExcelJS.Workbook, wp: ExportWorkplan) {
  const s = wb.addWorksheet("Workplan");
  const header = [
    "WBS",
    "Task",
    "Phase",
    "Start",
    "Finish",
    "Milestone?",
    "Resource",
    "Firm",
    "Rate Yr",
    "Rate",
    "Hours",
    "Cost",
    "Status",
    "Notes",
  ];
  s.addRow(header);
  styleHeaderRow(s.getRow(1));

  for (const t of wp.tasks) {
    if (t.assignments.length === 0) {
      s.addRow([
        t.wbs,
        t.task_name,
        t.phase ?? "",
        t.start_date ?? "",
        t.finish_date ?? "",
        t.is_milestone ? "★" : "",
        "",
        "",
        "",
        "",
        t.total_hours,
        t.total_cost,
        TASK_STATUS_LABEL[t.status],
        t.notes ?? "",
      ]);
    } else {
      for (const a of t.assignments) {
        s.addRow([
          t.wbs,
          t.task_name,
          t.phase ?? "",
          t.start_date ?? "",
          t.finish_date ?? "",
          t.is_milestone ? "★" : "",
          a.resource_name,
          a.firm,
          a.rate_year ?? "",
          a.rate ?? "",
          a.hours,
          a.cost,
          TASK_STATUS_LABEL[t.status],
          t.notes ?? "",
        ]);
      }
    }
  }

  s.getColumn(10).numFmt = '"$"#,##0.00';
  s.getColumn(11).numFmt = "#,##0.00";
  s.getColumn(12).numFmt = '"$"#,##0';

  // Per-row styling: milestones yellow, status column coloured.
  s.eachRow((row, idx) => {
    if (idx === 1) return;
    const milestoneCell = row.getCell(6);
    if (milestoneCell.value === "★") {
      row.eachCell((c) => {
        c.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: YELLOW },
        };
      });
    }
    const statusLabel = String(row.getCell(13).value ?? "");
    const statusKey = Object.entries(TASK_STATUS_LABEL).find(
      ([, label]) => label === statusLabel,
    )?.[0];
    if (statusKey && STATUS_FILL[statusKey]) {
      const c = row.getCell(13);
      c.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: STATUS_FILL[statusKey] },
      };
      c.font = { color: { argb: "FFFFFFFF" }, bold: true };
    }
  });

  autosize(s, [8, 50, 6, 11, 11, 10, 22, 14, 8, 10, 10, 12, 18, 40]);
}

function buildMilestonesSheet(wb: ExcelJS.Workbook, wp: ExportWorkplan) {
  const s = wb.addWorksheet("Milestones");
  s.addRow(["", "WBS", "Milestone", "Date", "Status", "Notes"]);
  styleHeaderRow(s.getRow(1));
  for (const t of wp.tasks) {
    if (!t.is_milestone) continue;
    const row = s.addRow([
      "★",
      t.wbs,
      t.task_name,
      t.finish_date ?? t.start_date ?? "",
      TASK_STATUS_LABEL[t.status],
      t.notes ?? "",
    ]);
    row.getCell(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: YELLOW },
    };
  }
  autosize(s, [4, 8, 42, 14, 18, 40]);
}

function buildResourcesSheet(wb: ExcelJS.Workbook, wp: ExportWorkplan) {
  const s = wb.addWorksheet("Resources");
  s.addRow(["Name", "Firm", "Role", "Current Rate"]);
  styleHeaderRow(s.getRow(1));
  for (const r of wp.resources) {
    s.addRow([r.full_name, r.firm, r.role_description ?? "", r.current_rate ?? ""]);
  }
  s.getColumn(4).numFmt = '"$"#,##0.00';
  autosize(s, [28, 22, 32, 14]);
}

function buildRateHistorySheet(wb: ExcelJS.Workbook, wp: ExportWorkplan) {
  const s = wb.addWorksheet("Rate History");
  s.addRow(["Resource", "Firm", "Effective From", "Effective To", "Rate Loaded", "Source"]);
  styleHeaderRow(s.getRow(1));
  for (const r of wp.rateHistory) {
    s.addRow([
      r.resource_name,
      r.firm,
      r.effective_from,
      r.effective_to ?? "—",
      r.rate_loaded,
      r.rate_source ?? "",
    ]);
  }
  s.getColumn(5).numFmt = '"$"#,##0.00';
  autosize(s, [28, 22, 14, 14, 14, 28]);
}

function buildCostAnalysisSheet(wb: ExcelJS.Workbook, wp: ExportWorkplan) {
  const s = wb.addWorksheet("Cost Analysis");

  s.addRow(["BY FIRM"]);
  s.getCell("A1").font = {
    name: "Oswald",
    bold: true,
    color: { argb: DARK_GREEN },
  };
  s.addRow(["Firm", "Hours", "Cost"]);
  styleHeaderRow(s.getRow(2));
  Object.entries(wp.totals.byFirm).forEach(([firm, v]) => {
    s.addRow([firm, v.hours, v.cost]);
  });

  const phaseStart = s.rowCount + 2;
  s.addRow([]);
  s.addRow(["BY PHASE"]);
  s.getCell(`A${phaseStart + 1}`).font = {
    name: "Oswald",
    bold: true,
    color: { argb: DARK_GREEN },
  };
  s.addRow(["Phase", "Hours", "Cost"]);
  styleHeaderRow(s.getRow(phaseStart + 2));
  Object.entries(wp.totals.byPhase).forEach(([phase, v]) => {
    s.addRow([phase, v.hours, v.cost]);
  });

  const monthStart = s.rowCount + 2;
  s.addRow([]);
  s.addRow(["BY MONTH"]);
  s.getCell(`A${monthStart + 1}`).font = {
    name: "Oswald",
    bold: true,
    color: { argb: DARK_GREEN },
  };
  s.addRow(["Month", "Hours", "Cost"]);
  styleHeaderRow(s.getRow(monthStart + 2));
  wp.totals.byMonth.forEach((m) => {
    s.addRow([m.month, m.hours, m.cost]);
  });

  // Currency format on all cost columns. Find all rows with numeric col C.
  s.eachRow((row) => {
    const c = row.getCell(3);
    if (typeof c.value === "number") {
      c.numFmt = '"$"#,##0';
    }
    const b = row.getCell(2);
    if (typeof b.value === "number" && row.number > 2) {
      b.numFmt = "#,##0.00";
    }
  });

  autosize(s, [22, 12, 14]);
}

function styleHeaderRow(row: ExcelJS.Row): void {
  row.eachCell((c) => {
    c.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: DARK_GREEN },
    };
    c.font = {
      name: "Oswald",
      bold: true,
      color: { argb: "FFFFFFFF" },
    };
    c.alignment = { vertical: "middle" };
  });
  row.height = 20;
}

function autosize(sheet: ExcelJS.Worksheet, widths: number[]) {
  widths.forEach((w, i) => {
    sheet.getColumn(i + 1).width = w;
  });
}
