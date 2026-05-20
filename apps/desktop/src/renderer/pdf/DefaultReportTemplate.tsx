import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";
import type { ReportData } from "../../main/services/report.service";
import type { TemplateConfig } from "@shared/template-config";

function mapFont(f: TemplateConfig["fontFamily"]): string {
  if (f === "Times" || f === "Georgia") return "Times-Roman";
  return "Helvetica";
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const dd = d.getDate().toString().padStart(2, "0");
  const mm = (d.getMonth() + 1).toString().padStart(2, "0");
  return `${dd}-${mm}-${d.getFullYear()}`;
}

export function DefaultReportTemplate({ data, config }: { data: ReportData; config: TemplateConfig }) {
  const fontFamily = mapFont(config.fontFamily);
  const accent = config.accentColor;
  const size = config.fontSize;

  const showLogo = config.sections.logo && !!data.lab.logo;
  const showDoctor = config.sections.doctorInfo;
  const showTable = config.sections.parametersTable;
  const showLegend = config.sections.abnormalLegend;
  const showDisclaimer = config.sections.disclaimer;

  const hasAnyAbnormal = data.groups.some(g =>
    g.tests.some(t => t.parameters.some(p => p.isAbnormal))
  );

  const showUnit  = config.columns.unit;
  const showRange = config.columns.referenceRange;
  const showFlag  = config.columns.flag;
  const showComments = config.columns.comments;

  const s = StyleSheet.create({
    page: { paddingTop: 28, paddingBottom: 36, paddingHorizontal: 32, fontSize: size, fontFamily, flexDirection: "column" },
    body: { flexGrow: 1 },

    header:      { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", borderBottomWidth: 1.5, borderBottomColor: accent, paddingBottom: 6, marginBottom: 8 },
    headerLeft:  { flexDirection: "column", flex: 1 },
    labName:     { color: accent, fontSize: size + 14, fontWeight: 700, letterSpacing: 0.5 },
    headerMeta:  { fontSize: size - 1, marginTop: 1, color: "#1f2937" },
    headerRight: { width: 170, flexDirection: "row", justifyContent: "flex-end", alignItems: "flex-start", gap: 6 },
    doctorBlock: { flexDirection: "column", alignItems: "flex-end" },
    doctorName:  { fontStyle: "italic", fontWeight: 700, fontSize: size + 1 },
    doctorQuals: { fontSize: size - 2, color: "#1f2937", textAlign: "right" },
    logo:        { width: 52, height: 52, marginLeft: 4 },

    patient:        { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", marginBottom: 2 },
    patientCell:    { fontSize: size, marginRight: 10, marginBottom: 1 },
    patientLabel:   { color: "#4b5563" },
    patientStrong:  { fontWeight: 700 },

    columnHeader:   { flexDirection: "row", borderBottomWidth: 0.75, borderBottomColor: "#374151", paddingBottom: 2, marginTop: 4, marginBottom: 4 },
    colSpacer:      { width: 260 },
    colUnit:        { width: 70, fontSize: size - 1, textAlign: "left",  color: "#4b5563" },
    colRange:       { width: 120, fontSize: size - 1, textAlign: "left", color: "#4b5563" },
    colFlag:        { width: 24, fontSize: size - 1, textAlign: "center", color: "#4b5563" },
    colComments:    { width: 110, fontSize: size - 1, textAlign: "left",  color: "#4b5563" },

    sectionHead: { marginTop: 8, marginBottom: 3, fontWeight: 700, fontSize: size + 1, textDecoration: "underline", color: "#111827" },
    testHead:    { marginTop: 3, marginLeft: 4, fontWeight: 700, fontSize: size },
    row:         { flexDirection: "row", alignItems: "flex-start", paddingVertical: 1.2 },
    rowLabel:    { flexDirection: "row", width: 260 },
    labelText:   { width: 180, fontSize: size },
    labelIndent: { width: 168, paddingLeft: 12, fontSize: size },
    colon:       { width: 10, textAlign: "center" },
    value:       { width: 70, fontWeight: 500 },
    valueAbn:    { color: accent, fontWeight: 700 },
    unitText:    { width: 70, fontSize: size },
    rangeText:   { width: 120, fontSize: size, color: "#1f2937" },
    flagDot:     { width: 6, height: 6, borderRadius: 3, backgroundColor: accent, marginTop: 4, marginLeft: 8 },
    flagBlank:   { width: 24 },
    commentText: { width: 110, fontSize: size - 1, color: "#374151" },

    outsourceNote: { fontSize: size - 2, color: "#6b7280", fontStyle: "italic", marginLeft: 4 },

    signRow:    { marginTop: 28, flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 6 },
    signCell:   { width: "40%", alignItems: "center" },
    signLine:   { borderTopWidth: 0.75, borderTopColor: "#1f2937", width: "100%", marginBottom: 2, marginTop: 18 },
    signLabel:  { fontSize: size, fontWeight: 700 },

    legend:     { marginTop: 6, flexDirection: "row", alignItems: "center", gap: 4, fontSize: size - 2, color: "#4b5563" },

    banner:     { marginTop: 10, backgroundColor: accent, color: "#ffffff", textAlign: "center", paddingVertical: 4, fontWeight: 700, fontSize: size, letterSpacing: 1 },
    footerText: { marginTop: 6, fontSize: size - 2, color: "#4b5563" },
    disclaimer: { marginTop: 4, fontSize: size - 2, color: "#374151" }
  });

  const colHeader = (
    <View style={s.columnHeader}>
      <View style={s.colSpacer} />
      {showUnit  && <Text style={s.colUnit}>Units</Text>}
      {showRange && <Text style={s.colRange}>Normal Range</Text>}
      {showFlag  && <Text style={s.colFlag}>Flag</Text>}
      {showComments && <Text style={s.colComments}>Comments</Text>}
    </View>
  );

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <View style={s.headerLeft}>
            <Text style={s.labName}>{data.lab.name.toUpperCase()}</Text>
            {config.headerText ? <Text style={s.headerMeta}>{config.headerText}</Text> : null}
            <Text style={s.headerMeta}>{data.lab.address}</Text>
            <Text style={s.headerMeta}>
              Mobile: {data.lab.phone}{data.lab.email ? `  ·  ${data.lab.email}` : ""}
            </Text>
          </View>
          <View style={s.headerRight}>
            {showDoctor && data.lab.pathologistName && (
              <View style={s.doctorBlock}>
                <Text style={s.doctorName}>{data.lab.pathologistName}</Text>
                {data.lab.pathologistQuals
                  ? data.lab.pathologistQuals.split("\n").map((line, i) => (
                      <Text key={i} style={s.doctorQuals}>{line}</Text>
                    ))
                  : null}
              </View>
            )}
            {showLogo && data.lab.logo && (
              <Image
                src={data.lab.logo.startsWith("data:")
                  ? data.lab.logo
                  : `file://${String(data.lab.logo).replace(/\\/g, "/")}`}
                style={s.logo}
              />
            )}
          </View>
        </View>

        <View style={s.patient}>
          <Text style={s.patientCell}><Text style={s.patientLabel}>No. </Text><Text style={s.patientStrong}>{data.visit.visitId}</Text></Text>
          <Text style={s.patientCell}><Text style={s.patientLabel}>Name : </Text><Text style={s.patientStrong}>{data.patient.name}</Text></Text>
          <Text style={s.patientCell}><Text style={s.patientLabel}>Age : </Text>{data.patient.age} Years</Text>
          <Text style={s.patientCell}><Text style={s.patientLabel}>Sex : </Text>{data.patient.sex}</Text>
          <Text style={s.patientCell}><Text style={s.patientLabel}>Date : </Text>{formatDate(data.visit.visitDate)}</Text>
        </View>
        <View style={s.patient}>
          <Text style={s.patientCell}><Text style={s.patientLabel}>Referred By Dr. : </Text>{data.patient.referredByName}</Text>
        </View>

        <View style={s.body}>
        {colHeader}

        {showTable && data.groups.map(g => (
          <View key={g.category} wrap={false}>
            <Text style={s.sectionHead}>{g.category}</Text>
            {g.tests.map(t => {
              const single = t.parameters.length === 1;
              return (
                <View key={t.name}>
                  {!single && (
                    <Text style={s.testHead}>
                      {t.name}{t.outsourcedSentTo ? ` (Outsourced: ${t.outsourcedSentTo})` : ""}
                    </Text>
                  )}
                  {single && t.outsourcedSentTo && (
                    <Text style={s.outsourceNote}>Outsourced: {t.outsourcedSentTo}</Text>
                  )}
                  {t.parameters.map(p => {
                    const label = single ? t.name : p.name;
                    return (
                      <View key={p.name} style={s.row}>
                        <View style={s.rowLabel}>
                          <Text style={!single ? [s.labelText, s.labelIndent] : s.labelText}>{label}</Text>
                          <Text style={s.colon}>:</Text>
                          <Text style={p.isAbnormal ? [s.value, s.valueAbn] : s.value}>{p.value || "—"}</Text>
                        </View>
                        {showUnit  && <Text style={s.unitText}>{p.unit}</Text>}
                        {showRange && <Text style={s.rangeText}>{p.range}</Text>}
                        {showFlag  && (p.isAbnormal ? <View style={s.flagDot} /> : <View style={s.flagBlank} />)}
                        {showComments && <Text style={s.commentText}>{(p as any).comment ?? p.notes ?? ""}</Text>}
                      </View>
                    );
                  })}
                </View>
              );
            })}
          </View>
        ))}

        {showLegend && hasAnyAbnormal && (
          <View style={s.legend}>
            <View style={s.flagDot} />
            <Text>Abnormal value</Text>
          </View>
        )}
        </View>

        <View style={s.signRow}>
          <View style={s.signCell}>
            <View style={s.signLine} />
            <Text style={s.signLabel}>Lab.Technician</Text>
          </View>
          <View style={s.signCell}>
            <View style={s.signLine} />
            <Text style={s.signLabel}>{config.signatureLine || "Pathologist"}</Text>
          </View>
        </View>

        <Text style={s.banner}>SUNDAY EVENING CLOSED</Text>

        {config.footerText ? <Text style={s.footerText}>{config.footerText}</Text> : null}

        {showDisclaimer && (
          <Text style={s.disclaimer}>
            Note : Please co-relate the finding. May vary from Lab to Lab due to types of kit used and variation in procedures. Any discrepancy may kindly be brought to notice. Not meant for medico-legal purpose.
          </Text>
        )}
      </Page>
    </Document>
  );
}
