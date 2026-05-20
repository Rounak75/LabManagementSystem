import { View, Text } from "@react-pdf/renderer";
import { sectionStyles as s, safeJson, type ReportTest } from "./common";

type TiterConfig = { antigens: string[]; dilutions: string[] };
type TiterResults = { results: Record<string, string> };

export function WidalSection({ tests }: { tests: ReportTest[] }) {
  const t = tests.find(x => x.name === "Widal Test");
  if (!t) return null;
  const grid = t.parameters.find(p => p.resultType === "TiterGrid");
  const opinion = t.parameters.find(p => p.name === "Opinion");
  const config = grid?.qualitativeOptions
    ? safeJson<TiterConfig>(grid.qualitativeOptions, { antigens: [], dilutions: [] })
    : { antigens: [], dilutions: [] };
  const parsedResults = grid?.value
    ? safeJson<TiterResults>(grid.value, { results: {} })
    : { results: {} };

  return (
    <View style={s.section}>
      <Text style={s.title}>WIDAL TEST</Text>
      {config.antigens.length > 0 && config.dilutions.length > 0 && (
        <View style={s.gridTable}>
          <View style={s.gridHead}>
            <Text style={s.gridLabel}>Antigen</Text>
            {config.dilutions.map(d => (
              <Text key={d} style={s.gridCell}>{d}</Text>
            ))}
          </View>
          {config.antigens.map(a => (
            <View key={a} style={{ flexDirection: "row", borderBottomWidth: 0.5, borderColor: "#cbd5e1" }}>
              <Text style={s.gridLabel}>{a}</Text>
              {config.dilutions.map(d => {
                const v = parsedResults.results[`${a}@${d}`] ?? "—";
                return <Text key={d} style={s.gridCell}>{v}</Text>;
              })}
            </View>
          ))}
        </View>
      )}
      {opinion?.value && (
        <View style={{ marginTop: 4 }}>
          <Text style={s.subhead}>Opinion</Text>
          <Text style={{ fontSize: 9 }}>{opinion.value}</Text>
        </View>
      )}
    </View>
  );
}
