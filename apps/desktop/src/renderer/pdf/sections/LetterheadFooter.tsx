import { View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import type { ReportData } from "../../../main/services/report.service";

const s = StyleSheet.create({
  header:      { borderBottomWidth: 1, paddingBottom: 6, marginBottom: 8, flexDirection: "row" },
  brand:       { flex: 1 },
  labName:     { fontSize: 16, fontWeight: 700 },
  addr:        { fontSize: 8, color: "#475569" },
  rightBlock:  { alignItems: "flex-end" },
  patho:       { fontSize: 11, fontWeight: 700, color: "#b91c1c" },
  pathoSub:    { fontSize: 8, color: "#b91c1c" },
  logo:        { width: 60, height: 60, marginRight: 8 },
  footer:      { position: "absolute", bottom: 16, left: 32, right: 32,
                 flexDirection: "row", justifyContent: "space-between",
                 fontSize: 8, color: "#475569" },
  closed:      { textAlign: "center", marginTop: 4, fontSize: 8, fontWeight: 700, color: "#b91c1c" }
});

function logoSrc(logo: string | null): string | null {
  if (!logo) return null;
  if (logo.startsWith("data:")) return logo;
  return `file://${logo.replace(/\\/g, "/")}`;
}

export function Letterhead({ lab }: { lab: ReportData["lab"] }) {
  const src = logoSrc(lab.logo);
  return (
    <View style={s.header}>
      {src && <Image src={src} style={s.logo} />}
      <View style={s.brand}>
        <Text style={s.labName}>{lab.name}</Text>
        <Text style={s.addr}>{lab.address}</Text>
        <Text style={s.addr}>Phone: {lab.phone}{lab.email ? ` · ${lab.email}` : ""}</Text>
      </View>
      {lab.pathologistName && (
        <View style={s.rightBlock}>
          <Text style={s.patho}>{lab.pathologistName}</Text>
          {lab.pathologistQuals && <Text style={s.pathoSub}>{lab.pathologistQuals}</Text>}
        </View>
      )}
    </View>
  );
}

export function Footer() {
  return (
    <View style={s.footer} fixed>
      <Text>Lab Technician</Text>
      <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
      <Text>Dr. P. C. Dubey, M.D. (Patho)</Text>
    </View>
  );
}
