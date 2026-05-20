import { View, Text } from "@react-pdf/renderer";
import { sectionStyles as s, type ReportTest } from "./common";

function renderTwoColumn(params: ReportTest["parameters"]) {
  const half = Math.ceil(params.length / 2);
  const left = params.slice(0, half);
  const right = params.slice(half);
  const rowCount = Math.max(left.length, right.length);
  const rows: { l?: ReportTest["parameters"][number]; r?: ReportTest["parameters"][number] }[] = [];
  for (let i = 0; i < rowCount; i++) {
    rows.push({ l: left[i], r: right[i] });
  }
  return (
    <View>
      {rows.map((row, i) => (
        <View key={i} style={{ flexDirection: "row" }}>
          <View style={{ flex: 1, flexDirection: "row", paddingVertical: 1, paddingRight: 8 }}>
            {row.l && (
              <>
                <Text style={s.pairLabel}>{row.l.name}</Text>
                <Text style={[s.pairValue, row.l.isAbnormal ? s.abn : {}]}>
                  {row.l.value || "—"}{row.l.unit ? ` ${row.l.unit}` : ""}
                </Text>
              </>
            )}
          </View>
          <View style={{ flex: 1, flexDirection: "row", paddingVertical: 1, paddingLeft: 8 }}>
            {row.r && (
              <>
                <Text style={s.pairLabel}>{row.r.name}</Text>
                <Text style={[s.pairValue, row.r.isAbnormal ? s.abn : {}]}>
                  {row.r.value || "—"}{row.r.unit ? ` ${row.r.unit}` : ""}
                </Text>
              </>
            )}
          </View>
        </View>
      ))}
    </View>
  );
}

const URINE_PHYSICAL = new Set([
  "Quantity", "Colour", "Odour", "Sp. Gravity", "Reaction (pH)", "Sediment"
]);
const URINE_CHEMICAL = new Set([
  "Sugar", "Albumin", "Phosphates", "Bile Salt", "Bile Pigment",
  "Urobilinogen", "Acetone", "Blood"
]);

export function UrineRoutineSection({ tests }: { tests: ReportTest[] }) {
  const t = tests.find(x => x.name === "Urine Routine Examination");
  if (!t) return null;
  const physical    = t.parameters.filter(p => URINE_PHYSICAL.has(p.name));
  const chemical    = t.parameters.filter(p => URINE_CHEMICAL.has(p.name));
  const microscopic = t.parameters.filter(p => !URINE_PHYSICAL.has(p.name) && !URINE_CHEMICAL.has(p.name));
  return (
    <View style={s.section}>
      <Text style={s.title}>URINE ROUTINE EXAMINATION</Text>
      {physical.length > 0 && <Text style={s.subhead}>Physical</Text>}
      {physical.length > 0 && renderTwoColumn(physical)}
      {chemical.length > 0 && <Text style={s.subhead}>Chemical</Text>}
      {chemical.length > 0 && renderTwoColumn(chemical)}
      {microscopic.length > 0 && <Text style={s.subhead}>Microscopic</Text>}
      {microscopic.length > 0 && renderTwoColumn(microscopic)}
    </View>
  );
}

const STOOL_PHYSICAL = new Set([
  "Colour", "Consistency", "Blood (Fresh)", "Mucus", "Reaction",
  "Parasites (Visible)", "Occult Blood"
]);

export function StoolRoutineSection({ tests }: { tests: ReportTest[] }) {
  const t = tests.find(x => x.name === "Stool Routine Examination");
  if (!t) return null;
  const physical    = t.parameters.filter(p => STOOL_PHYSICAL.has(p.name));
  const microscopic = t.parameters.filter(p => !STOOL_PHYSICAL.has(p.name));
  return (
    <View style={s.section}>
      <Text style={s.title}>STOOL ROUTINE EXAMINATION</Text>
      {physical.length > 0 && <Text style={s.subhead}>Physical</Text>}
      {physical.length > 0 && renderTwoColumn(physical)}
      {microscopic.length > 0 && <Text style={s.subhead}>Microscopic</Text>}
      {microscopic.length > 0 && renderTwoColumn(microscopic)}
    </View>
  );
}
