import { View, Text, StyleSheet } from "@react-pdf/renderer";
import { ALIGNMENT_CROSSHAIRS, mm } from "../layout-coords";

const styles = StyleSheet.create({
  crosshair: { position: "absolute", width: mm(20), height: mm(20), marginLeft: mm(-10), marginTop: mm(-10) },
  hLine: { position: "absolute", top: mm(10), left: 0, right: 0, height: 0.5, backgroundColor: "black" },
  vLine: { position: "absolute", left: mm(10), top: 0, bottom: 0, width: 0.5, backgroundColor: "black" },
  tick: { position: "absolute", width: 0.3, height: mm(1), backgroundColor: "black" },
  label: { position: "absolute", fontSize: 7, top: mm(11), left: mm(11) },
});

export function AlignmentCrosshairs() {
  return (
    <>
      {ALIGNMENT_CROSSHAIRS.map((c, i) => (
        <View key={i} style={[styles.crosshair, { left: mm(c.xMm), top: mm(c.yMm) }]}>
          <View style={styles.hLine} />
          <View style={styles.vLine} />
          {[-5, -4, -3, -2, -1, 1, 2, 3, 4, 5].map((offset) => (
            <View
              key={offset}
              style={[styles.tick, { top: mm(10), left: mm(10 + offset) }]}
            />
          ))}
          <Text style={styles.label}>{c.label}</Text>
        </View>
      ))}
    </>
  );
}
