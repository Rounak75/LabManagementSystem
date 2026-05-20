import { View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import { HEADER_BAND, mm } from "../layout-coords";
import type { LabInfo } from "../types";

const styles = StyleSheet.create({
  band: {
    position: "absolute", top: 0, left: 0, right: 0,
    height: mm(HEADER_BAND.heightMm),
    backgroundColor: "#1e40af", padding: 6, flexDirection: "row",
  },
  left: { flex: 1, justifyContent: "center" },
  labName: { color: "#dc2626", fontSize: 22, fontWeight: 700, letterSpacing: 0.5 },
  meta: { color: "white", fontSize: 8, marginTop: 1 },
  right: { width: 150, alignItems: "flex-end", flexDirection: "row" },
  doctorBox: { flexDirection: "column", alignItems: "flex-end", flex: 1 },
  doctorName: { color: "white", fontSize: 10, fontWeight: 700, fontStyle: "italic" },
  doctorQuals: { color: "white", fontSize: 7, textAlign: "right" },
  logo: { width: 40, height: 40, marginLeft: 6 },
});

export function HeaderBand({ lab }: { lab: LabInfo }) {
  return (
    <View style={styles.band} fixed>
      <View style={styles.left}>
        <Text style={styles.labName}>{lab.name.toUpperCase()}</Text>
        <Text style={styles.meta}>{lab.address}</Text>
        <Text style={styles.meta}>Time : {lab.timings}</Text>
        <Text style={styles.meta}>Mobile : {lab.phone}</Text>
      </View>
      <View style={styles.right}>
        <View style={styles.doctorBox}>
          <Text style={styles.doctorName}>{lab.pathologist.name}</Text>
          <Text style={styles.doctorQuals}>{lab.pathologist.qualifications}</Text>
        </View>
        {lab.logo ? <Image src={lab.logo} style={styles.logo} /> : null}
      </View>
    </View>
  );
}
