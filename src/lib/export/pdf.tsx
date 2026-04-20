import * as React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Svg,
  Path,
  renderToBuffer,
  Font,
} from "@react-pdf/renderer";
import type { ExportWorkplan, ExportTaskRow } from "./workplan-data";
import { TASK_STATUS_LABEL } from "@/lib/status";

/**
 * Attempt to register Oswald + Raleway from a CDN that serves .ttf directly.
 * jsdelivr mirrors the google/fonts GitHub repo where variable TTFs live.
 * Registration is wrapped in a try/catch because @react-pdf will throw at
 * render time if the font can't be fetched (Vercel serverless cold starts
 * occasionally block outbound). On failure we fall back to Helvetica, which
 * is baked into pdfkit — the PDF still renders, just without the custom type.
 */
let FONTS_OK = false;
try {
  Font.register({
    family: "Oswald",
    src: "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/oswald/Oswald%5Bwght%5D.ttf",
  });
  Font.register({
    family: "Raleway",
    src: "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/raleway/Raleway%5Bwght%5D.ttf",
  });
  FONTS_OK = true;
} catch (err) {
  console.warn("[pdf] font register failed — falling back to Helvetica", err);
  FONTS_OK = false;
}

// CME color tokens (hex — inline since react-pdf uses plain strings).
const COLORS = {
  darkGreen: "#25532E",
  brightGreen: "#3C9D48",
  yellow: "#FFCB0E",
  gray: "#C7C8CA",
  black: "#000000",
  red: "#E85F46",
  lightBg: "#FAFAF9",
  border: "#E5E4E2",
};

const HEAD_FAMILY = FONTS_OK ? "Oswald" : "Helvetica-Bold";
const BODY_FAMILY = FONTS_OK ? "Raleway" : "Helvetica";

const styles = StyleSheet.create({
  page: {
    paddingTop: 48,
    paddingBottom: 56,
    paddingHorizontal: 42,
    fontFamily: BODY_FAMILY,
    fontSize: 9,
    color: "#1f1f1f",
    backgroundColor: "#ffffff",
  },
  cover: {
    paddingTop: 48,
    paddingBottom: 56,
    paddingHorizontal: 42,
    fontFamily: BODY_FAMILY,
    fontSize: 10,
    color: "#1f1f1f",
    backgroundColor: "#ffffff",
  },
  footer: {
    position: "absolute",
    bottom: 26,
    left: 42,
    right: 42,
    fontSize: 8,
    color: "#666",
    flexDirection: "row",
    justifyContent: "space-between",
    borderTop: `1px solid ${COLORS.border}`,
    paddingTop: 6,
  },
  h1: {
    fontFamily: HEAD_FAMILY,
    fontSize: 32,
    letterSpacing: 2,
    color: COLORS.darkGreen,
  },
  h2: {
    fontFamily: HEAD_FAMILY,
    fontSize: 18,
    letterSpacing: 1.5,
    color: COLORS.darkGreen,
    marginBottom: 8,
  },
  h3: {
    fontFamily: HEAD_FAMILY,
    fontSize: 11,
    letterSpacing: 1.5,
    color: COLORS.darkGreen,
    textTransform: "uppercase",
    marginTop: 14,
    marginBottom: 4,
  },
  phaseBar: {
    backgroundColor: COLORS.darkGreen,
    color: "#fff",
    paddingVertical: 4,
    paddingHorizontal: 8,
    fontFamily: HEAD_FAMILY,
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginTop: 10,
    marginBottom: 2,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: COLORS.lightBg,
    borderTop: `1px solid ${COLORS.border}`,
    borderBottom: `1px solid ${COLORS.border}`,
    paddingVertical: 3,
    fontFamily: HEAD_FAMILY,
    fontSize: 8,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  tr: {
    flexDirection: "row",
    borderBottom: `0.5px solid ${COLORS.border}`,
    paddingVertical: 2.5,
    minHeight: 16,
  },
  trMilestone: {
    flexDirection: "row",
    backgroundColor: "#FFFBEB",
    borderBottom: `0.5px solid ${COLORS.yellow}`,
    paddingVertical: 3,
  },
  statusPill: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    fontSize: 7,
    borderRadius: 6,
    textAlign: "center",
  },
});

export async function renderWorkplanPdf(
  wp: ExportWorkplan,
): Promise<Buffer> {
  const doc = <WorkplanDoc wp={wp} />;
  const buf = await renderToBuffer(doc);
  return buf;
}

function WorkplanDoc({ wp }: { wp: ExportWorkplan }) {
  const byPhase = new Map<string, ExportTaskRow[]>();
  for (const t of wp.tasks) {
    const key = t.phase ?? "OTHER";
    const list = byPhase.get(key) ?? [];
    list.push(t);
    byPhase.set(key, list);
  }

  const phaseOrder = ["1", "1.5", "2", "3", "PM", "OTHER"];
  const phases = Array.from(byPhase.keys()).sort((a, b) => {
    const ai = phaseOrder.indexOf(a);
    const bi = phaseOrder.indexOf(b);
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
  });

  const milestones = wp.tasks.filter((t) => t.is_milestone);

  return (
    <Document
      title={`${wp.project.client_short} Workplan`}
      author="Cole Management & Engineering"
      subject={wp.versionLabel}
    >
      <CoverPage wp={wp} />
      {phases.map((phase) => (
        <WorkplanPage
          key={phase}
          wp={wp}
          phase={phase}
          rows={byPhase.get(phase) ?? []}
        />
      ))}
      <MilestonesPage wp={wp} milestones={milestones} />
      <CostSummaryPage wp={wp} />
      <VersionMetadataPage wp={wp} />
    </Document>
  );
}

function Letterhead() {
  return (
    <Svg width={120} height={40} viewBox="0 0 120 40">
      <Path d="M0,0 L36,0 L0,40 Z" fill={COLORS.darkGreen} />
      <Path d="M18,0 L60,0 L18,40 Z" fill={COLORS.brightGreen} />
    </Svg>
  );
}

function Footer({ wp, pageTag }: { wp: ExportWorkplan; pageTag: string }) {
  return (
    <View style={styles.footer} fixed>
      <Text>
        {wp.project.client_short} · {wp.versionLabel}
      </Text>
      <Text>{pageTag}</Text>
      <Text
        render={({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
          `Page ${pageNumber} of ${totalPages}`
        }
      />
    </View>
  );
}

function CoverPage({ wp }: { wp: ExportWorkplan }) {
  return (
    <Page size="LETTER" style={styles.cover}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Letterhead />
        <View style={{ marginLeft: 12 }}>
          <Text
            style={{
              fontFamily: HEAD_FAMILY,
              fontSize: 11,
              letterSpacing: 3,
              color: COLORS.brightGreen,
            }}
          >
            CME
          </Text>
          <Text
            style={{
              fontFamily: HEAD_FAMILY,
              fontSize: 9,
              letterSpacing: 2,
              color: COLORS.darkGreen,
            }}
          >
            CLIENT PORTAL
          </Text>
        </View>
      </View>

      <View style={{ marginTop: 120 }}>
        <Text
          style={{
            fontFamily: HEAD_FAMILY,
            fontSize: 11,
            letterSpacing: 3,
            color: COLORS.brightGreen,
          }}
        >
          PROJECT
        </Text>
        <Text style={styles.h1}>{wp.project.name.toUpperCase()}</Text>
        <Text
          style={{
            fontFamily: BODY_FAMILY,
            fontSize: 14,
            color: COLORS.darkGreen,
            marginTop: 4,
          }}
        >
          {wp.project.client_name}
        </Text>
        <View
          style={{
            marginTop: 36,
            height: 2,
            backgroundColor: COLORS.yellow,
            width: 64,
          }}
        />
        <Text style={{ marginTop: 20, fontSize: 11 }}>{wp.versionLabel}</Text>
        <Text style={{ marginTop: 2, fontSize: 10, color: "#666" }}>
          {wp.versionSubtitle}
        </Text>
      </View>

      <View style={{ position: "absolute", bottom: 56, left: 42, right: 42 }}>
        <View
          style={{
            borderTop: `1px solid ${COLORS.border}`,
            paddingTop: 10,
          }}
        />
        <Text style={{ fontSize: 9, color: "#888" }}>
          Cole Management & Engineering · CME Client Portal
        </Text>
        <Text style={{ fontSize: 9, color: "#888" }}>
          Generated {wp.generatedAt.slice(0, 10)}
        </Text>
      </View>
    </Page>
  );
}

function WorkplanPage({
  wp,
  phase,
  rows,
}: {
  wp: ExportWorkplan;
  phase: string;
  rows: ExportTaskRow[];
}) {
  return (
    <Page size="LETTER" style={styles.page} wrap>
      <Text style={styles.h2}>WORKPLAN — PHASE {phase}</Text>
      <Text style={styles.phaseBar} fixed>
        Phase {phase} · {rows.length} rows · {Math.round(
          rows.reduce((s, r) => s + r.total_hours, 0),
        )} hrs
      </Text>
      <View style={styles.tableHeader} fixed>
        <Text style={{ width: 44 }}>WBS</Text>
        <Text style={{ flexGrow: 1 }}>Task</Text>
        <Text style={{ width: 46 }}>Start</Text>
        <Text style={{ width: 46 }}>Finish</Text>
        <Text style={{ width: 70 }}>Resource</Text>
        <Text style={{ width: 32, textAlign: "right" }}>Hrs</Text>
        <Text style={{ width: 24, textAlign: "right" }}>Yr</Text>
        <Text style={{ width: 40, textAlign: "right" }}>Rate</Text>
        <Text style={{ width: 48, textAlign: "right" }}>Cost</Text>
        <Text style={{ width: 48 }}>Status</Text>
      </View>

      {rows.flatMap((t) => renderTaskRows(t))}

      <Footer wp={wp} pageTag={`Workplan — Phase ${phase}`} />
    </Page>
  );
}

function renderTaskRows(t: ExportTaskRow): React.ReactNode[] {
  if (t.is_milestone || t.assignments.length === 0) {
    return [
      <View
        key={t.id + "-m"}
        style={t.is_milestone ? styles.trMilestone : styles.tr}
        wrap={false}
      >
        <Text style={{ width: 44, fontSize: 7 }}>{t.wbs}</Text>
        <Text style={{ flexGrow: 1 }}>
          {t.is_milestone ? "◆ " : ""}
          {t.task_name}
        </Text>
        <Text style={{ width: 46, fontSize: 7 }}>{t.start_date ?? ""}</Text>
        <Text style={{ width: 46, fontSize: 7 }}>{t.finish_date ?? ""}</Text>
        <Text style={{ width: 70 }}>—</Text>
        <Text style={{ width: 32, textAlign: "right" }}>0</Text>
        <Text style={{ width: 24, textAlign: "right" }}>—</Text>
        <Text style={{ width: 40, textAlign: "right" }}>—</Text>
        <Text style={{ width: 48, textAlign: "right" }}>$0</Text>
        <View style={{ width: 48 }}>
          <StatusPill status={t.status} />
        </View>
      </View>,
    ];
  }
  return t.assignments.map((a, i) => (
    <View key={`${t.id}-${i}`} style={styles.tr} wrap={false}>
      <Text style={{ width: 44, fontSize: 7 }}>{i === 0 ? t.wbs : ""}</Text>
      <Text style={{ flexGrow: 1 }}>
        {i === 0 ? t.task_name : ""}
        {i > 0 ? "  ↳" : ""}
      </Text>
      <Text style={{ width: 46, fontSize: 7 }}>
        {i === 0 ? t.start_date ?? "" : ""}
      </Text>
      <Text style={{ width: 46, fontSize: 7 }}>
        {i === 0 ? t.finish_date ?? "" : ""}
      </Text>
      <Text style={{ width: 70, fontSize: 7 }}>{a.resource_name}</Text>
      <Text style={{ width: 32, textAlign: "right" }}>
        {Math.round(a.hours)}
      </Text>
      <Text style={{ width: 24, textAlign: "right", fontSize: 7 }}>
        {a.rate_year ?? ""}
      </Text>
      <Text style={{ width: 40, textAlign: "right", fontSize: 7 }}>
        {a.rate != null ? `$${a.rate.toFixed(2)}` : "—"}
      </Text>
      <Text style={{ width: 48, textAlign: "right" }}>
        ${Math.round(a.cost).toLocaleString()}
      </Text>
      <View style={{ width: 48 }}>
        {i === 0 && <StatusPill status={t.status} />}
      </View>
    </View>
  ));
}

function StatusPill({ status }: { status: string }) {
  const colors: Record<string, { bg: string; fg: string }> = {
    not_started: { bg: COLORS.gray, fg: "#1f1f1f" },
    in_development: { bg: COLORS.yellow, fg: "#1f1f1f" },
    submitted_for_review: { bg: "#4B5F9E", fg: "#fff" },
    accepted: { bg: COLORS.brightGreen, fg: "#fff" },
    rejected: { bg: COLORS.red, fg: "#fff" },
    deferred: { bg: "#52361C", fg: "#fff" },
  };
  const c = colors[status] ?? colors.not_started;
  return (
    <Text
      style={[styles.statusPill, { backgroundColor: c.bg, color: c.fg }]}
    >
      {TASK_STATUS_LABEL[status as keyof typeof TASK_STATUS_LABEL] ?? status}
    </Text>
  );
}

function MilestonesPage({
  wp,
  milestones,
}: {
  wp: ExportWorkplan;
  milestones: ExportTaskRow[];
}) {
  return (
    <Page size="LETTER" style={styles.page} wrap>
      <Text style={styles.h2}>MILESTONES</Text>
      {milestones.length === 0 && (
        <Text style={{ color: "#888", marginTop: 14 }}>
          No milestones defined.
        </Text>
      )}
      <View style={styles.tableHeader}>
        <Text style={{ width: 20 }}>◆</Text>
        <Text style={{ width: 48 }}>WBS</Text>
        <Text style={{ flexGrow: 1 }}>Milestone</Text>
        <Text style={{ width: 80 }}>Date</Text>
        <Text style={{ width: 80 }}>Status</Text>
      </View>
      {milestones.map((m) => (
        <View key={m.id} style={styles.trMilestone} wrap={false}>
          <Text style={{ width: 20, color: COLORS.darkGreen }}>◆</Text>
          <Text style={{ width: 48, fontSize: 7 }}>{m.wbs}</Text>
          <Text style={{ flexGrow: 1 }}>{m.task_name}</Text>
          <Text style={{ width: 80, fontSize: 8 }}>
            {m.finish_date ?? m.start_date ?? ""}
          </Text>
          <View style={{ width: 80 }}>
            <StatusPill status={m.status} />
          </View>
        </View>
      ))}
      <Footer wp={wp} pageTag="Milestones" />
    </Page>
  );
}

function CostSummaryPage({ wp }: { wp: ExportWorkplan }) {
  const firmRows = Object.entries(wp.totals.byFirm).sort(
    ([, a], [, b]) => b.cost - a.cost,
  );
  const phaseRows = Object.entries(wp.totals.byPhase);
  return (
    <Page size="LETTER" style={styles.page} wrap>
      <Text style={styles.h2}>COST SUMMARY</Text>

      <View style={{ flexDirection: "row", gap: 14, marginTop: 4 }}>
        <SummaryTile label="Total hours" value={Math.round(wp.totals.hours).toLocaleString()} />
        <SummaryTile
          label="Total cost (w/ escalation)"
          value={`$${Math.round(wp.totals.cost).toLocaleString()}`}
        />
        <SummaryTile
          label="Baseline year"
          value={String(wp.project.baseline_year)}
        />
      </View>

      <Text style={styles.h3}>BY FIRM</Text>
      <MiniTable
        headers={["Firm", "Hours", "Cost"]}
        rows={firmRows.map(([firm, v]) => [
          firm,
          Math.round(v.hours).toLocaleString(),
          `$${Math.round(v.cost).toLocaleString()}`,
        ])}
      />

      <Text style={styles.h3}>BY PHASE</Text>
      <MiniTable
        headers={["Phase", "Hours", "Cost"]}
        rows={phaseRows.map(([phase, v]) => [
          phase,
          Math.round(v.hours).toLocaleString(),
          `$${Math.round(v.cost).toLocaleString()}`,
        ])}
      />

      <Text style={styles.h3}>BY MONTH</Text>
      <MiniTable
        headers={["Month", "Hours", "Cost"]}
        rows={wp.totals.byMonth.map((m) => [
          m.month,
          Math.round(m.hours).toLocaleString(),
          `$${Math.round(m.cost).toLocaleString()}`,
        ])}
      />

      <Footer wp={wp} pageTag="Cost Summary" />
    </Page>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <View
      style={{
        flexGrow: 1,
        borderLeft: `3px solid ${COLORS.brightGreen}`,
        paddingHorizontal: 10,
        paddingVertical: 8,
        backgroundColor: COLORS.lightBg,
      }}
    >
      <Text style={{ fontSize: 7, letterSpacing: 1, color: "#555" }}>
        {label.toUpperCase()}
      </Text>
      <Text
        style={{
          fontFamily: HEAD_FAMILY,
          fontSize: 18,
          letterSpacing: 1,
          color: COLORS.darkGreen,
          marginTop: 2,
        }}
      >
        {value}
      </Text>
    </View>
  );
}

function MiniTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: string[][];
}) {
  return (
    <View
      style={{
        borderTop: `1px solid ${COLORS.border}`,
        marginTop: 2,
        marginBottom: 6,
      }}
    >
      <View style={styles.tableHeader}>
        {headers.map((h, i) => (
          <Text
            key={i}
            style={{ flexGrow: 1, textAlign: i === 0 ? "left" : "right" }}
          >
            {h}
          </Text>
        ))}
      </View>
      {rows.map((r, ri) => (
        <View key={ri} style={styles.tr} wrap={false}>
          {r.map((c, ci) => (
            <Text
              key={ci}
              style={{ flexGrow: 1, textAlign: ci === 0 ? "left" : "right" }}
            >
              {c}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

function VersionMetadataPage({ wp }: { wp: ExportWorkplan }) {
  return (
    <Page size="LETTER" style={styles.page}>
      <Text style={styles.h2}>VERSION METADATA</Text>
      <Text style={{ marginTop: 10, fontSize: 10 }}>
        <Text style={{ fontFamily: HEAD_FAMILY }}>Label: </Text>
        {wp.versionLabel}
      </Text>
      <Text style={{ marginTop: 4, fontSize: 10 }}>
        <Text style={{ fontFamily: HEAD_FAMILY }}>Subtitle: </Text>
        {wp.versionSubtitle}
      </Text>
      <Text style={{ marginTop: 4, fontSize: 10 }}>
        <Text style={{ fontFamily: HEAD_FAMILY }}>Generated: </Text>
        {wp.generatedAt}
      </Text>
      <Text style={{ marginTop: 4, fontSize: 10 }}>
        <Text style={{ fontFamily: HEAD_FAMILY }}>Tasks: </Text>
        {wp.tasks.length}
      </Text>
      <Text style={{ marginTop: 4, fontSize: 10 }}>
        <Text style={{ fontFamily: HEAD_FAMILY }}>Resources: </Text>
        {wp.resources.length}
      </Text>

      <Text style={styles.h3}>RATE HISTORY</Text>
      <MiniTable
        headers={["Resource", "From", "To", "Rate", "Source"]}
        rows={wp.rateHistory.slice(0, 40).map((r) => [
          r.resource_name,
          r.effective_from,
          r.effective_to ?? "—",
          `$${r.rate_loaded.toFixed(2)}`,
          r.rate_source ?? "",
        ])}
      />

      <Footer wp={wp} pageTag="Version Metadata" />
    </Page>
  );
}
