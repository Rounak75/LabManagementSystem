import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import type { ReportData } from "../../main/services/report.service";
import type { TemplateConfig } from "@shared/template-config";
import { Letterhead, Footer } from "./sections/LetterheadFooter";
import { flattenTests } from "./sections/common";
import { BiochemistrySection } from "./sections/BiochemistrySection";
import { HematologySection } from "./sections/HematologySection";
import { UrineRoutineSection, StoolRoutineSection } from "./sections/UrineStoolSection";
import { WidalSection } from "./sections/WidalSection";
import { CultureSensitivitySection } from "./sections/CultureSensitivitySection";
import { SerologySection } from "./sections/SerologySection";
import { CommentsSection } from "./sections/CommentsSection";

const s = StyleSheet.create({
  page:        { paddingTop: 32, paddingBottom: 40, paddingHorizontal: 32, fontSize: 9, fontFamily: "Helvetica" },
  patientBar:  { borderBottomWidth: 1, paddingBottom: 4, marginBottom: 8, flexDirection: "row",
                 justifyContent: "space-between", flexWrap: "wrap" },
  patientItem: { fontSize: 9, marginRight: 12 }
});

function formatDate(iso: string): string {
  const d = new Date(iso);
  const dd = d.getDate().toString().padStart(2, "0");
  const mm = (d.getMonth() + 1).toString().padStart(2, "0");
  return `${dd}-${mm}-${d.getFullYear()}`;
}

export function GolmuriStandardTemplate({ data }: { data: ReportData; config: TemplateConfig }) {
  const tests = flattenTests(data.groups);
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Letterhead lab={data.lab} />
        <View style={s.patientBar}>
          <Text style={s.patientItem}>Patient: <Text style={{ fontWeight: 700 }}>{data.patient.name}</Text></Text>
          <Text style={s.patientItem}>ID: {data.patient.patientId}</Text>
          <Text style={s.patientItem}>Age/Sex: {data.patient.age}/{data.patient.sex}</Text>
          <Text style={s.patientItem}>Ref by: {data.patient.referredByName}</Text>
          <Text style={s.patientItem}>Date: {formatDate(data.visit.visitDate)}</Text>
        </View>
        <BiochemistrySection tests={tests} />
        <HematologySection tests={tests} />
        <UrineRoutineSection tests={tests} />
        <StoolRoutineSection tests={tests} />
        <WidalSection tests={tests} />
        <CultureSensitivitySection tests={tests} />
        <SerologySection tests={tests} />
        <CommentsSection tests={tests} />
        <Footer />
      </Page>
    </Document>
  );
}
