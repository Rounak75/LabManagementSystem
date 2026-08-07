// Phase 3d Plan B — printed at the bottom of every report so patients know how
// to log into the portal. Renders only when both fields are present (portal URL
// is the load-bearing one — set in Settings → Lab Info).
//
// This used to print a 6-character access code beside the patient id. The code
// was retired: the report carried both credentials, and the code was the weaker
// of the two — good for 180 days against a full session, with no password step
// and no way to revoke it. The patient id does the same job, is the thing staff
// can read out over the phone, and is already how the instruction line below
// tells people to sign in.

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

export function PortalSignInFooter({
  portalUrl,
  patientPhone,
  patientId,
}: {
  portalUrl?: string;
  patientPhone?: string;
  patientId?: string;
}) {
  // Printing the strip without a patient id would leave an instruction nobody
  // can follow, which is worse than printing nothing.
  if (!portalUrl || !patientPhone || !patientId) return null;
  return (
    <View style={styles.container} fixed>
      <Text style={styles.row}>View your report online at {portalUrl}</Text>
      <Text style={styles.important}>
        Phone: {patientPhone}   Patient ID: {patientId}
      </Text>
      <Text style={styles.row}>
        Signing in for the first time? Use your Patient ID, then choose a password.
      </Text>
    </View>
  );
}
