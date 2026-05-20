import { View, Text, StyleSheet } from "@react-pdf/renderer";
import { COLUMN_HEADERS, TEST_SECTIONS_TABLE, mm } from "../layout-coords";

const styles = StyleSheet.create({
  row: {
    position: "absolute", left: 0, right: 0,
    fontSize: 9, fontWeight: 700,
    borderBottomWidth: 0.5, borderBottomColor: "#1e40af", paddingBottom: 2,
  },
  label: { position: "absolute" },
});

export function ColumnHeaders() {
  return (
    <View style={[styles.row, { top: mm(COLUMN_HEADERS.topMm) }]} fixed>
      <Text style={[styles.label, { left: mm(TEST_SECTIONS_TABLE.leftMarginMm) }]}>Test</Text>
      <Text style={[styles.label, { left: mm(TEST_SECTIONS_TABLE.valueXMm) }]}>Value</Text>
      <Text style={[styles.label, { left: mm(TEST_SECTIONS_TABLE.unitXMm) }]}>Units</Text>
      <Text style={[styles.label, { left: mm(TEST_SECTIONS_TABLE.rangeXMm) }]}>Normal Range</Text>
    </View>
  );
}
