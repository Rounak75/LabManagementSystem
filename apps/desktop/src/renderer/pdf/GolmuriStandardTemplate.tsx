import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import type { ReportData } from "../../main/services/report.service";
import { resolveLetterhead, mmToPt, type TemplateConfig } from "@shared/template-config";
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
  patientItem: { fontSize: 9, marginRight: 12 },

  // How a patient gets into the portal. The lab prints no receipts, so this
  // strip on the report is the only written record of their patient id they
  // ever receive — staff read it out at the counter, and this is the copy they
  // take home. Set at the same 8pt as the letterhead address: it is secondary
  // to the results, but a patient still has to be able to read it.
  signIn:      { marginTop: 10, borderTopWidth: 0.5, borderColor: "#cbd5e1", paddingTop: 4 },
  signInHead:  { fontSize: 8, fontWeight: 700, marginBottom: 2 },
  signInBody:  { fontSize: 8, color: "#475569", lineHeight: 1.4 }
});

function formatDate(iso: string): string {
  const d = new Date(iso);
  const dd = d.getDate().toString().padStart(2, "0");
  const mm = (d.getMonth() + 1).toString().padStart(2, "0");
  return `${dd}-${mm}-${d.getFullYear()}`;
}

export function GolmuriStandardTemplate({ data, config }: { data: ReportData; config: TemplateConfig }) {
  const tests = flattenTests(data.groups);
  const portalUrl = data.lab.portalUrl?.trim();
  // Pre-printed letterhead: drop the drawn bands the paper already carries and
  // leave their space blank instead of sliding the results up into them.
  const lh = resolveLetterhead(config);
  const pageStyle = lh.contentOnly
    ? [
        s.page,
        {
          paddingTop: mmToPt(lh.headerReserveMm),
          ...(lh.footerReserveMm > 0 ? { paddingBottom: mmToPt(lh.footerReserveMm) } : {}),
        },
      ]
    : s.page;
  return (
    <Document>
      <Page size="A4" style={pageStyle}>
        {!lh.skipHeader && <Letterhead lab={data.lab} />}
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

        {portalUrl ? (
          <View style={s.signIn}>
            <Text style={s.signInHead}>VIEW THIS REPORT ONLINE</Text>
            <Text style={s.signInBody}>
              Go to {portalUrl} and sign in with your phone number{" "}
              {data.patient.phone ? `(${data.patient.phone}) ` : ""}
              and patient ID {data.patient.patientId}. You will be asked to choose a password the
              first time — after that, sign in with the password.
            </Text>
          </View>
        ) : null}

        {!lh.skipFooter && <Footer lab={data.lab} signatureLine={config.signatureLine} />}
      </Page>
    </Document>
  );
}
