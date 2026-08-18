import { View, Text, StyleSheet } from "@react-pdf/renderer";
import { TEST_SECTIONS_TABLE, mm } from "../layout-coords";
import { abnormalFlag } from "../abnormal-flag";
import type { ResultGroup, Calibration } from "../types";

const styles = StyleSheet.create({
  container: { position: "absolute" },
  sectionTitle: { fontSize: 10, fontWeight: 700, textDecoration: "underline", marginTop: 4 },
  row: { flexDirection: "row", marginBottom: 1 },
  testName: { width: "44%", fontSize: 10 },
  colon: { width: "2%", fontSize: 10, textAlign: "center" },
  // The value column is a row so the H/L marker can sit beside the number
  // without either of them changing the column's width.
  valueCell: { width: "16%", flexDirection: "row" },
  value: { fontSize: 10 },
  valueAbnormal: { fontSize: 10, fontWeight: 700, color: "#b91c1c" },
  // The marker carries the abnormality on its own. Colour and weight are the
  // screen's cue; this letter is the one that survives a mono print.
  abnFlag: { fontSize: 10, fontWeight: 700, color: "#b91c1c", marginLeft: 3 },
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
              <View style={styles.valueCell}>
                <Text style={t.isAbnormal ? styles.valueAbnormal : styles.value}>{t.value}</Text>
                {t.isAbnormal && (
                  <Text style={styles.abnFlag}>{abnormalFlag(t.value, t.refRange)}</Text>
                )}
              </View>
              <Text style={styles.unit}>{t.unit}</Text>
              <Text style={styles.range}>{t.refRange}</Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}
