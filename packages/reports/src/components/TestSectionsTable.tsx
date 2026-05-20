import { View, Text, StyleSheet } from "@react-pdf/renderer";
import { TEST_SECTIONS_TABLE, mm } from "../layout-coords";
import type { ResultGroup, Calibration } from "../types";

const styles = StyleSheet.create({
  container: { position: "absolute" },
  sectionTitle: { fontSize: 10, fontWeight: 700, textDecoration: "underline", marginTop: 4 },
  row: { flexDirection: "row", marginBottom: 1 },
  testName: { width: "44%", fontSize: 10 },
  colon: { width: "2%", fontSize: 10, textAlign: "center" },
  value: { width: "16%", fontSize: 10 },
  valueAbnormal: { width: "16%", fontSize: 10, fontWeight: 700, color: "#b91c1c" },
  unit: { width: "14%", fontSize: 10 },
  range: { width: "24%", fontSize: 10 },
});

export function TestSectionsTable({
  groups,
  calibration,
}: {
  groups: ResultGroup[];
  calibration: Calibration;
}) {
  const yTop = TEST_SECTIONS_TABLE.topMm + calibration.yOffsetMm;
  const dx = calibration.xOffsetMm;

  return (
    <View
      style={[styles.container, {
        top: mm(yTop),
        left: mm(TEST_SECTIONS_TABLE.leftMarginMm + dx),
        right: mm(10 - dx),
      }]}
    >
      {groups.map((g, gi) => (
        <View key={gi} style={{ marginBottom: 6 }}>
          <Text style={styles.sectionTitle}>{g.sectionTitle}</Text>
          {g.tests.map((t, ti) => (
            <View key={ti} style={styles.row}>
              <Text style={styles.testName}>{t.testName}</Text>
              <Text style={styles.colon}>:</Text>
              <Text style={t.isAbnormal ? styles.valueAbnormal : styles.value}>{t.value}</Text>
              <Text style={styles.unit}>{t.unit}</Text>
              <Text style={styles.range}>{t.refRange}</Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}
