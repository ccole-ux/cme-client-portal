import * as React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { ExportWorkplan } from "./workplan-data";

const COLORS = {
  darkGreen: "#25532E",
  brightGreen: "#3C9D48",
  yellow: "#FFCB0E",
  border: "#E5E4E2",
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 48,
    paddingBottom: 56,
    paddingHorizontal: 48,
    fontFamily: "Helvetica",
    fontSize: 10,
    lineHeight: 1.5,
    color: "#1f1f1f",
  },
  h1: {
    fontFamily: "Helvetica-Bold",
    fontSize: 24,
    color: COLORS.darkGreen,
    letterSpacing: 1.5,
  },
  h2: {
    fontFamily: "Helvetica-Bold",
    fontSize: 13,
    color: COLORS.darkGreen,
    marginTop: 18,
    marginBottom: 4,
    letterSpacing: 0.5,
  },
});

export async function renderNarrativePdf(wp: ExportWorkplan): Promise<Buffer> {
  return renderToBuffer(<NarrativeDoc wp={wp} />);
}

function NarrativeDoc({ wp }: { wp: ExportWorkplan }) {
  return (
    <Document
      title={`${wp.project.client_short} Narrative`}
      author="Cole Management & Engineering"
    >
      <Page size="LETTER" style={styles.page}>
        <Text
          style={{
            fontFamily: "Helvetica-Bold",
            fontSize: 10,
            letterSpacing: 3,
            color: COLORS.brightGreen,
          }}
        >
          STATUS NARRATIVE
        </Text>
        <Text style={styles.h1}>{wp.project.name.toUpperCase()}</Text>
        <Text style={{ fontSize: 11, color: "#666", marginTop: 4 }}>
          {wp.project.client_name}
        </Text>
        <View
          style={{
            marginTop: 10,
            borderBottom: `1px solid ${COLORS.yellow}`,
            width: 80,
          }}
        />

        {wp.narrative.length === 0 ? (
          <Text style={{ marginTop: 20, color: "#888" }}>
            No narrative published yet.
          </Text>
        ) : (
          wp.narrative.map((n, i) => (
            <View key={i}>
              <Text style={styles.h2}>{n.title}</Text>
              <Text>{stripMarkdown(n.body_markdown)}</Text>
            </View>
          ))
        )}

        <View
          fixed
          style={{
            position: "absolute",
            bottom: 26,
            left: 48,
            right: 48,
            fontSize: 8,
            color: "#666",
            borderTop: `1px solid ${COLORS.border}`,
            paddingTop: 6,
            flexDirection: "row",
            justifyContent: "space-between",
          }}
        >
          <Text>{wp.project.client_short} · Narrative</Text>
          <Text
            render={({
              pageNumber,
              totalPages,
            }: {
              pageNumber: number;
              totalPages: number;
            }) => `Page ${pageNumber} of ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}

// Minimal markdown flattener — strips headers, emphasis, and lists to plain
// text since @react-pdf's Text doesn't handle markdown natively. Full rich
// rendering is a follow-up.
function stripMarkdown(s: string): string {
  return s
    .replace(/^#+\s*/gm, "")
    .replace(/[*_`]{1,3}([^*_`]+)[*_`]{1,3}/g, "$1")
    .replace(/^\s*[-*]\s+/gm, "• ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
