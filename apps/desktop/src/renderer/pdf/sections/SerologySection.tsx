import { View, Text } from "@react-pdf/renderer";
import { SEROLOGY_NAMES, sectionStyles as s, type ReportTest } from "./common";

export function SerologySection({ tests }: { tests: ReportTest[] }) {
  const rows = tests.filter(t => SEROLOGY_NAMES.has(t.name));
  if (rows.length === 0) return null;
  return (
    <View style={s.section}>
      <Text style={s.title}>SEROLOGY &amp; SPECIAL TESTS</Text>
      <View style={s.row}>
        <Text style={[s.cell1, s.header]}>Test</Text>
        <Text style={[s.cell2, s.header]}>Result</Text>
        <Text style={[s.cell3, s.header]}>Normal / Reference</Text>
      </View>
      {rows.flatMap(t =>
        t.parameters.map(p => (
          <View key={`${t.name}-${p.name}`} style={s.row}>
            <Text style={s.cell1}>
              {t.name}{t.parameters.length > 1 ? ` — ${p.name}` : ""}
            </Text>
            <Text style={[s.cell2, p.isAbnormal ? s.abn : {}]}>
              {p.value || "—"}{p.unit ? ` ${p.unit}` : ""}
            </Text>
            <Text style={s.cell3}>{p.range || "—"}</Text>
          </View>
        ))
      )}
    </View>
  );
}
