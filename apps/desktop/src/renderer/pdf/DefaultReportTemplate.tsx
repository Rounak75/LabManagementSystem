import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";
import type { ReportData } from "../../main/services/report.service";
import type { TemplateConfig } from "@shared/template-config";

// @react-pdf/renderer ships PDF standard fonts only (Helvetica, Times-Roman,
// Courier). Map our config's fontFamily to the closest built-in family so we
// don't need to register external font files.
function mapFont(f: TemplateConfig["fontFamily"]): string {
  if (f === "Times" || f === "Georgia") return "Times-Roman";
  return "Helvetica";
}

type ColumnKey = "testName" | "result" | "unit" | "referenceRange" | "flag" | "comments";

// Relative widths per column. We normalize across the visible columns so the
// row always fills 100% even when some columns are hidden.
const COL_WEIGHTS: Record<ColumnKey, number> = {
  testName: 32,
  result: 18,
  unit: 12,
  referenceRange: 22,
  flag: 6,
  comments: 20,
};

function visibleColumns(cfg: TemplateConfig): ColumnKey[] {
  const order: ColumnKey[] = ["testName", "result", "unit", "referenceRange", "flag", "comments"];
  return order.filter(k => cfg.columns[k]);
}

function widthsFor(cols: ColumnKey[]): Record<ColumnKey, string> {
  const total = cols.reduce((sum, k) => sum + COL_WEIGHTS[k], 0) || 1;
  const out = {} as Record<ColumnKey, string>;
  for (const k of cols) out[k] = `${(COL_WEIGHTS[k] / total) * 100}%`;
  return out;
}

export function DefaultReportTemplate({ data, config }: { data: ReportData; config: TemplateConfig }) {
  const dt = new Date(data.visit.visitDate);
  const dateStr = `${dt.getDate().toString().padStart(2, "0")}-${(dt.getMonth()+1).toString().padStart(2, "0")}-${dt.getFullYear()}`;

  const fontFamily = mapFont(config.fontFamily);
  const accent = config.accentColor;
  const cols = visibleColumns(config);
  const w = widthsFor(cols);

  const styles = StyleSheet.create({
    page:    { padding: 32, fontSize: config.fontSize, fontFamily },
    header:  { borderBottomWidth: 2, borderBottomColor: accent, paddingBottom: 8, marginBottom: 12, flexDirection: "row", justifyContent: "space-between" },
    headerLeft: { flexDirection: "row", gap: 8, alignItems: "center" },
    logo:    { width: 48, height: 48 },
    labName: { color: accent, fontSize: 18, fontWeight: 700 },
    headerText: { fontSize: 9, color: "#475569", marginTop: 2 },
    meta:    { fontSize: 9, color: "#475569" },
    patient: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 12, fontSize: config.fontSize },
    groupHeading: { backgroundColor: "#e2e8f0", padding: 4, marginTop: 8, marginBottom: 4, fontWeight: 700, fontSize: config.fontSize + 1 },
    testName: { fontWeight: 700, marginTop: 4, marginBottom: 2 },
    table:   { borderWidth: 1, borderColor: "#cbd5e1" },
    th:      { flexDirection: "row", backgroundColor: accent, borderBottomWidth: 1, borderBottomColor: "#cbd5e1" },
    thCell:  { padding: 4, fontWeight: 700, fontSize: 9, color: "#ffffff" },
    tr:      { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#e2e8f0" },
    td:      { padding: 4 },
    abn:     { color: accent, fontWeight: 700 },
    flagDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: accent },
    signRow: { marginTop: 24, flexDirection: "row", justifyContent: "space-between" },
    signBlk: { width: "40%", borderTopWidth: 1, borderTopColor: accent, paddingTop: 4, fontSize: 9 },
    legend:  { marginTop: 8, flexDirection: "row", alignItems: "center", gap: 4, fontSize: 8, color: "#475569" },
    footerText: { marginTop: 12, fontSize: 9, color: "#475569" },
    footer:  { marginTop: 8, padding: 6, borderWidth: 1, borderColor: "#cbd5e1", fontSize: 8, color: "#475569" },
    closed:  { textAlign: "center", marginTop: 8, fontSize: 9, fontWeight: 700, color: accent },
  });

  const showLogo = config.sections.logo && !!data.lab.logo;
  const showDoctor = config.sections.doctorInfo;
  const showTable = config.sections.parametersTable;
  const showLegend = config.sections.abnormalLegend;
  const showDisclaimer = config.sections.disclaimer;

  const colHeaderLabel: Record<ColumnKey, string> = {
    testName: "Parameter",
    result: "Result",
    unit: "Unit",
    referenceRange: "Normal range",
    flag: "Flag",
    comments: "Comments",
  };

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            {showLogo && data.lab.logo && (
              <Image src={`file://${String(data.lab.logo).replace(/\\/g, "/")}`} style={styles.logo} />
            )}
            <View>
              <Text style={styles.labName}>{data.lab.name}</Text>
              {config.headerText ? <Text style={styles.headerText}>{config.headerText}</Text> : null}
              <Text style={styles.meta}>{data.lab.address}</Text>
              <Text style={styles.meta}>Phone: {data.lab.phone}{data.lab.email ? ` · ${data.lab.email}` : ""}</Text>
            </View>
          </View>
          {showDoctor && data.lab.pathologistName && (
            <View>
              <Text style={{ fontWeight: 700 }}>{data.lab.pathologistName}</Text>
              <Text style={styles.meta}>{data.lab.pathologistQuals}</Text>
            </View>
          )}
        </View>

        <View style={styles.patient}>
          <Text>Patient: <Text style={{ fontWeight: 700 }}>{data.patient.name}</Text></Text>
          <Text>Age: {data.patient.age}</Text>
          <Text>Sex: {data.patient.sex}</Text>
          <Text>ID: {data.patient.patientId}</Text>
          <Text>Date: {dateStr}</Text>
          {showDoctor && <Text>Referred by: {data.patient.referredByName}</Text>}
        </View>

        {showTable && data.groups.map(g => (
          <View key={g.category} wrap={false}>
            <Text style={styles.groupHeading}>{g.category}</Text>
            {g.tests.map(t => (
              <View key={t.name}>
                <Text style={styles.testName}>{t.name}{t.outsourcedSentTo ? ` (Outsourced: ${t.outsourcedSentTo})` : ""}</Text>
                <View style={styles.table}>
                  <View style={styles.th}>
                    {cols.map(k => (
                      <Text key={k} style={[styles.thCell, { width: w[k] }]}>{colHeaderLabel[k]}</Text>
                    ))}
                  </View>
                  {t.parameters.map(p => (
                    <View key={p.name} style={styles.tr}>
                      {cols.map(k => {
                        const base = [styles.td, { width: w[k] }] as any[];
                        if (k === "testName") return <Text key={k} style={base}>{p.name}</Text>;
                        if (k === "result") return <Text key={k} style={[...base, p.isAbnormal ? styles.abn : {}]}>{p.value || "—"}</Text>;
                        if (k === "unit") return <Text key={k} style={base}>{p.unit}</Text>;
                        if (k === "referenceRange") return <Text key={k} style={base}>{p.range}</Text>;
                        if (k === "flag") return (
                          <View key={k} style={[styles.td, { width: w[k], flexDirection: "row", alignItems: "center" }]}>
                            {p.isAbnormal ? <View style={styles.flagDot} /> : <Text> </Text>}
                          </View>
                        );
                        if (k === "comments") return <Text key={k} style={base}>{(p as any).comment || ""}</Text>;
                        return null;
                      })}
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </View>
        ))}

        {showLegend && (
          <View style={styles.legend}>
            <View style={styles.flagDot} />
            <Text>Abnormal value</Text>
          </View>
        )}

        <View style={styles.signRow}>
          <View style={styles.signBlk}><Text>Lab Technician</Text></View>
          <View style={styles.signBlk}>
            <Text>{config.signatureLine || data.lab.pathologistName || "Pathologist"}</Text>
          </View>
        </View>

        <Text style={styles.closed}>SUNDAY EVENING CLOSED</Text>

        {config.footerText ? <Text style={styles.footerText}>{config.footerText}</Text> : null}

        {showDisclaimer && (
          <View style={styles.footer}>
            <Text>Note: Please correlate findings clinically. This report is not for medico-legal purposes.</Text>
          </View>
        )}
      </Page>
    </Document>
  );
}
