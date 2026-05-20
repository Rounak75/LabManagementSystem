import { View, Text } from "@react-pdf/renderer";
import { sectionStyles as s, type ReportTest } from "./common";

export function CommentsSection({ tests }: { tests: ReportTest[] }) {
  const notes: { test: string; param: string; note: string }[] = [];
  for (const t of tests) {
    for (const p of t.parameters) {
      if (p.notes && p.notes.trim().length > 0) {
        notes.push({ test: t.name, param: p.name, note: p.notes });
      }
    }
  }
  if (notes.length === 0) return null;
  return (
    <View style={s.section}>
      <Text style={s.title}>COMMENTS / NOTES</Text>
      {notes.map((n, i) => (
        <View key={i} style={{ paddingVertical: 2 }}>
          <Text style={{ fontSize: 8, fontWeight: 700 }}>
            {n.test}{n.param !== "Value" ? ` — ${n.param}` : ""}
          </Text>
          <Text style={{ fontSize: 9 }}>{n.note}</Text>
        </View>
      ))}
    </View>
  );
}
