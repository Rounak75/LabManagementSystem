import { Document, Page, StyleSheet } from "@react-pdf/renderer";
import { HeaderBand } from "./components/HeaderBand";
import { PatientInfoRow } from "./components/PatientInfoRow";
import { ColumnHeaders } from "./components/ColumnHeaders";
import { TestSectionsTable } from "./components/TestSectionsTable";
import { FooterBand } from "./components/FooterBand";
import { AlignmentCrosshairs } from "./components/AlignmentCrosshairs";
import { PortalSignInFooter } from "./components/PortalSignInFooter";
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
        {/* No patient id means no instruction the patient could follow, so the
            strip is left off entirely rather than printed half-useful. */}
        {showContent && patient.patientIdDisplay && (
          <PortalSignInFooter
            portalUrl={lab.portalUrl}
            patientPhone={patient.phone}
            patientId={patient.patientIdDisplay}
          />
        )}
        {showAlignment && <AlignmentCrosshairs />}
      </Page>
    </Document>
  );
}
