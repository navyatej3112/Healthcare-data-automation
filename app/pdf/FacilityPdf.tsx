import {
  Document,
  Page,
  View,
  Text,
  Link,
  StyleSheet,
} from "@react-pdf/renderer";
import type { Report } from "@/lib/report";

// Print-ready PDF matching the Facility_Assessment_Snapshot template: branding
// banner, two-column label/value table, and a clickable Medicare link.
// Loaded only on the client (dynamically, on download click).

const styles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 48,
    paddingHorizontal: 40,
    fontSize: 11,
    color: "#171717",
    fontFamily: "Helvetica",
  },
  header: { marginBottom: 16, textAlign: "center" },
  brand: { fontSize: 12, fontFamily: "Helvetica-Bold", color: "#52525b" },
  title: { fontSize: 14, fontFamily: "Helvetica-Bold", marginTop: 4 },
  state: { fontSize: 11, color: "#52525b", marginTop: 2 },
  table: { borderTop: "1px solid #d4d4d8" },
  row: {
    flexDirection: "row",
    borderBottom: "1px solid #d4d4d8",
    minHeight: 24,
    alignItems: "center",
  },
  cellLabel: {
    width: "55%",
    paddingVertical: 6,
    paddingRight: 8,
    fontFamily: "Helvetica-Bold",
  },
  cellValue: { width: "45%", paddingVertical: 6 },
  linkWrap: { marginTop: 18, fontSize: 10 },
  linkLabel: { color: "#52525b", marginBottom: 2 },
  link: { color: "#1d4ed8", textDecoration: "underline" },
});

export function FacilityPdf({ report }: { report: Report }) {
  return (
    <Document title={`Facility Assessment Snapshot - ${report.ccn}`}>
      <Page size="A4" style={styles.page}>
        {/* Branding — INFINITE banner is a fixed brand name and is never replaced
            by the facility name (which lives in the table under "Name of Facility"). */}
        <View style={styles.header}>
          <Text style={styles.brand}>INFINITE — Managed by MEDELITE</Text>
          <Text style={styles.title}>FACILITY ASSESSMENT SNAPSHOT</Text>
          <Text style={styles.state}>{report.state || "—"}</Text>
        </View>

        <View style={styles.table}>
          {report.rows.map((r) => (
            <View style={styles.row} key={r.label} wrap={false}>
              <Text style={styles.cellLabel}>{r.label}</Text>
              <Text style={styles.cellValue}>{r.value || "—"}</Text>
            </View>
          ))}
        </View>

        <View style={styles.linkWrap}>
          <Text style={styles.linkLabel}>Medicare Care Compare source:</Text>
          <Link src={report.medicareUrl} style={styles.link}>
            {report.medicareUrl}
          </Link>
        </View>
      </Page>
    </Document>
  );
}
