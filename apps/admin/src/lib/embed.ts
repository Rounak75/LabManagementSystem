// Supabase embeds a to-one relation as an object, but its generated types (and
// some runtimes) surface it as an array. Normalize to a single value.
export type Embedded<T> = T | T[] | null | undefined;

export function embedOne<T>(v: Embedded<T>): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}
