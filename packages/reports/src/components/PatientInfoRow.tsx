import { View, Text, StyleSheet } from "@react-pdf/renderer";
import { PATIENT_INFO_ROW, mm } from "../layout-coords";
import type { PatientInfo, Calibration } from "../types";

const styles = StyleSheet.create({
  row: { position: "absolute", left: 0, right: 0, fontSize: 10 },
  field: { position: "absolute" },
});

function formatDate(iso: string): string {
  const d = new Date(iso);
  const dd = d.getUTCDate().toString().padStart(2, "0");
  const mo = (d.getUTCMonth() + 1).toString().padStart(2, "0");
  return `${dd}-${mo}-${d.getUTCFullYear()}`;
}

export function PatientInfoRow({
  patient,
  calibration,
}: {
  patient: PatientInfo;
  calibration: Calibration;
}) {
  const yTop = PATIENT_INFO_ROW.topMm + calibration.yOffsetMm;
  const yReferredBy = PATIENT_INFO_ROW.referredByTopMm + calibration.yOffsetMm;
  const dx = calibration.xOffsetMm;

  return (
    <>
      <View style={[styles.row, { top: mm(yTop) }]} fixed>
        <Text style={[styles.field, { left: mm(PATIENT_INFO_ROW.nameXMm + dx) }]}>
          Name : {patient.name}
        </Text>
        <Text style={[styles.field, { left: mm(PATIENT_INFO_ROW.ageXMm + dx) }]}>
          Age : {patient.age} Years
        </Text>
        <Text style={[styles.field, { left: mm(PATIENT_INFO_ROW.sexXMm + dx) }]}>
          Sex : {patient.sex}
        </Text>
        <Text style={[styles.field, { left: mm(PATIENT_INFO_ROW.dateXMm + dx) }]}>
          Date : {formatDate(patient.visitDate)}
        </Text>
      </View>
      <View style={[styles.row, { top: mm(yReferredBy) }]} fixed>
        <Text style={[styles.field, { left: mm(PATIENT_INFO_ROW.nameXMm + dx) }]}>
          Referred By Dr. : {patient.referringDoctor ?? "Self"}
        </Text>
        <Text style={[styles.field, { left: mm(PATIENT_INFO_ROW.dateXMm + dx) }]}>
          Visit ID : {patient.visitIdDisplay}
        </Text>
      </View>
    </>
  );
}
