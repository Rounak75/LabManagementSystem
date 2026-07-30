// Test categories come from the lab's own catalogue, so the icon map is
// matched loosely on the category name and falls back to a neutral trace
// rather than rendering nothing when the lab adds a new discipline.

import {
  Droplet,
  Flask,
  Shield,
  Microscope,
  Vial,
  Hormone,
  Heart,
  Pulse,
} from "./icons";

const MAP: [RegExp, (p: { size?: number }) => JSX.Element][] = [
  [/haemat|hemat|blood/i, Droplet],
  [/biochem|chemistry/i, Flask],
  [/serolog|immuno/i, Shield],
  [/patholog/i, Microscope],
  [/microbio|culture/i, Vial],
  [/endocrin|hormone|thyroid/i, Hormone],
  [/cardi/i, Heart],
];

export function CategoryIcon({
  category,
  size = 21,
}: {
  category: string;
  size?: number;
}) {
  const hit = MAP.find(([re]) => re.test(category));
  const Icon = hit ? hit[1] : Pulse;
  return <Icon size={size} />;
}
