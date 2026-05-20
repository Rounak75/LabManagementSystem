import { View, Text } from "@react-pdf/renderer";
import { sectionStyles as s, safeJson, type ReportTest } from "./common";

type GridConfig = { drugs: string[] };
type GridResult = { sensitivities: Record<string, string> };

export function CultureSensitivitySection({ tests }: { tests: ReportTest[] }) {
  const t = tests.find(x => x.name === "Culture & Sensitivity Test");
  if (!t) return null;
  const sample   = t.parameters.find(p => p.name === "Culture Sample");
  const organism = t.parameters.find(p => p.name === "Organism Isolated");
  const grid     = t.parameters.find(p => p.resultType === "SensitivityGrid");

  const drugs = grid?.qualitativeOptions
    ? safeJson<GridConfig>(grid.qualitativeOptions, { drugs: [] }).drugs
    : [];
  const sens = grid?.value
    ? safeJson<GridResult>(grid.value, { sensitivities: {} }).sensitivities
    : {};

  const drugRows = drugs
    .map(d => ({ drug: d, result: sens[d] }))
    .filter(r => r.result && r.result !== "—");

  return (
    <View style={s.section}>
      <Text style={s.title}>CULTURE &amp; SENSITIVITY TEST</Text>
      <View style={{ flexDirection: "row", paddingVertical: 1 }}>
        <Text style={s.pairLabel}>Culture Sample</Text>
        <Text style={s.pairValue}>{sample?.value || "—"}</Text>
      </View>
      <View style={{ flexDirection: "row", paddingVertical: 1 }}>
        <Text style={s.pairLabel}>Organism Isolated</Text>
        <Text style={s.pairValue}>{organism?.value || "—"}</Text>
      </View>
      {drugRows.length > 0 && (
        <>
          <Text style={s.subhead}>Antibiotic Sensitivity</Text>
          {drugRows.map(r => (
            <View key={r.drug} style={{ flexDirection: "row", paddingVertical: 1 }}>
              <Text style={s.pairLabel}>{r.drug}</Text>
              <Text style={s.pairValue}>{r.result}</Text>
            </View>
          ))}
          <Text style={s.legend}>
            + Mildly Sensitive · ++ Moderately Sensitive · +++ Highly Sensitive · R Resistant
          </Text>
        </>
      )}
    </View>
  );
}
