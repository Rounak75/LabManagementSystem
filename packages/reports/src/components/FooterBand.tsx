import { View, Text, StyleSheet } from "@react-pdf/renderer";
import { FOOTER_BAND, SIGNATURE_LABELS, mm } from "../layout-coords";

const styles = StyleSheet.create({
  signatureRow: {
    position: "absolute",
    top: mm(SIGNATURE_LABELS.topMm),
    left: 0, right: 0,
    flexDirection: "row", justifyContent: "space-between",
    paddingHorizontal: 18,
  },
  signatureLabel: { fontSize: 9 },
  footerBand: {
    position: "absolute",
    top: mm(FOOTER_BAND.topMm),
    left: 0, right: 0,
    height: mm(FOOTER_BAND.heightMm),
    backgroundColor: "#1e40af",
    padding: 4,
  },
  sundayClosed: { color: "#dc2626", fontSize: 9, fontWeight: 700, textAlign: "center", marginBottom: 2 },
  note: { color: "white", fontSize: 7, textAlign: "center" },
});

export function FooterBand() {
  return (
    <>
      <View style={styles.signatureRow} fixed>
        <Text style={styles.signatureLabel}>Lab.Technician</Text>
        <Text style={styles.signatureLabel}>Pathologist</Text>
      </View>
      <View style={styles.footerBand} fixed>
        <Text style={styles.sundayClosed}>SUNDAY EVENING CLOSED</Text>
        <Text style={styles.note}>
          Note : Please co-relate the findings — may vary from Lab to Lab due to kit type and procedural variation.
          Any discrepancy may kindly be brought to our notice. Not meant for medico-legal purpose.
        </Text>
      </View>
    </>
  );
}
