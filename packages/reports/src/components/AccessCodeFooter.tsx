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
  patientId,
}: {
  portalUrl?: string;
  patientPhone?: string;
  accessCode?: string;
  patientId?: string;
}) {
  // The patient id alone is enough to sign in for the first time, so this strip
  // is worth printing even before an access code exists. Requiring the code as
  // well — as it used to — meant the sign-in instructions were missing from
  // exactly the reports of patients who had never signed in.
  if (!portalUrl || !patientPhone || (!accessCode && !patientId)) return null;
  return (
    <View style={styles.container} fixed>
      <Text style={styles.row}>View your report online at {portalUrl}</Text>
      <Text style={styles.important}>
        Phone: {patientPhone}
        {patientId ? `   Patient ID: ${patientId}` : ""}
        {accessCode ? `   Access code: ${accessCode}` : ""}
      </Text>
      <Text style={styles.row}>
        Signing in for the first time? Use your Patient ID, then choose a password.
      </Text>
    </View>
  );
}
