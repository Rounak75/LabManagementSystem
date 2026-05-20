// Phase 3d Plan B — printed at the bottom of every report so patients
// know how to log into the portal. Renders only when all three fields are
// present (portal URL is the load-bearing one — set in Settings → Lab Info).

import { View, Text, StyleSheet } from "@react-pdf/renderer";

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: "30mm",
    left: 0, right: 0,
    paddingHorizontal: 18,
    alignItems: "center",
  },
  row: { fontSize: 8, color: "#1f2937", textAlign: "center" },
  important: { fontSize: 9, fontWeight: 700, textAlign: "center" },
});

export function AccessCodeFooter({
  portalUrl,
  patientPhone,
  accessCode,
}: {
  portalUrl?: string;
  patientPhone?: string;
  accessCode?: string;
}) {
  if (!portalUrl || !accessCode || !patientPhone) return null;
  return (
    <View style={styles.container} fixed>
      <Text style={styles.row}>View your report online at {portalUrl}</Text>
      <Text style={styles.important}>Phone: {patientPhone}   Access code: {accessCode}</Text>
    </View>
  );
}
