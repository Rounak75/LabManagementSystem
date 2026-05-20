import { View, Text } from "@react-pdf/renderer";
import { sectionStyles as s, type ReportTest } from "./common";

const DIFFERENTIAL = new Set([
  "Neutrophils", "Lymphocytes", "Monocytes", "Eosinophils", "Basophils"
]);

export function HematologySection({ tests }: { tests: ReportTest[] }) {
  const cbc = tests.find(t => t.name === "CBC / Blood Examination");
  if (!cbc) return null;
  const main = cbc.parameters.filter(p => !DIFFERENTIAL.has(p.name));
  const diff = cbc.parameters.filter(p => DIFFERENTIAL.has(p.name));
  return (
    <View style={s.section}>
      <Text style={s.title}>REPORT ON EXAMINATION OF BLOOD</Text>
      <View style={s.row}>
        <Text style={[s.cell1, s.header]}>Parameter</Text>
        <Text style={[s.cell2, s.header]}>Result</Text>
        <Text style={[s.cell3, s.header]}>Normal Range</Text>
      </View>
      {main.map(p => (
        <View key={p.name} style={s.row}>
          <Text style={s.cell1}>{p.name}</Text>
          <Text style={[s.cell2, p.isAbnormal ? s.abn : {}]}>
            {p.value || "—"}{p.unit ? ` ${p.unit}` : ""}
          </Text>
          <Text style={s.cell3}>{p.range || "—"}</Text>
        </View>
      ))}
      {diff.length > 0 && (
        <>
          <Text style={s.subhead}>Differential WBC Count</Text>
          {diff.map(p => (
            <View key={p.name} style={s.row}>
              <Text style={s.cell1}>{p.name}</Text>
              <Text style={[s.cell2, p.isAbnormal ? s.abn : {}]}>
                {p.value || "—"}{p.unit ? ` ${p.unit}` : ""}
              </Text>
              <Text style={s.cell3}>{p.range || "—"}</Text>
            </View>
          ))}
        </>
      )}
    </View>
  );
}
