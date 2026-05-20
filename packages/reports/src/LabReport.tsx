import { Document, Page, StyleSheet } from "@react-pdf/renderer";
import { HeaderBand } from "./components/HeaderBand";
import { PatientInfoRow } from "./components/PatientInfoRow";
import { ColumnHeaders } from "./components/ColumnHeaders";
import { TestSectionsTable } from "./components/TestSectionsTable";
import { FooterBand } from "./components/FooterBand";
import { AlignmentCrosshairs } from "./components/AlignmentCrosshairs";
import { AccessCodeFooter } from "./components/AccessCodeFooter";
import type { LabReportProps } from "./types";

const styles = StyleSheet.create({
  page: { fontFamily: "Helvetica" },
});

export function LabReport({
  patient,
  lab,
  groups,
  layout = "FullPage",
  calibration = { xOffsetMm: 0, yOffsetMm: 0 },
  accessCode,
}: LabReportProps) {
  const showHeader = layout === "FullPage";
  const showColumnHeaders = layout === "FullPage";
  const showFooter = layout === "FullPage";
  const showAlignment = layout === "AlignmentTest";
  const showContent = layout !== "AlignmentTest";

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {showHeader && <HeaderBand lab={lab} />}
        {showContent && <PatientInfoRow patient={patient} calibration={calibration} />}
        {showColumnHeaders && <ColumnHeaders />}
        {showContent && <TestSectionsTable groups={groups} calibration={calibration} />}
        {showFooter && <FooterBand />}
        {showContent && accessCode && (
          <AccessCodeFooter
            portalUrl={lab.portalUrl}
            patientPhone={patient.phone}
            accessCode={accessCode}
          />
        )}
        {showAlignment && <AlignmentCrosshairs />}
      </Page>
    </Document>
  );
}
