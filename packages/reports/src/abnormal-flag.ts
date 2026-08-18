/**
 * The marker printed next to an out-of-range result: H, L, or a neutral *.
 *
 * An abnormal value used to be distinguished by red text alone. The lab prints
 * in black and white, so on the paper a patient is actually handed a dangerously
 * high result looked exactly like a normal one. A letter survives any printer.
 *
 * Called only for results already judged abnormal, so anything it cannot place
 * against a numeric range still gets a mark. Returning "" for those would mean
 * a qualitative abnormal — "Positive" where "Negative" is normal — printed
 * exactly like a normal one, which is the failure this exists to prevent.
 *
 * This is the same rule the desktop's own PDF sections apply in
 * `apps/desktop/src/renderer/pdf/sections/common.ts`. It lives here as well
 * because this package renders the copy the *patient* downloads from the
 * portal, and that copy went unflagged for as long as the two were separate.
 */
export function abnormalFlag(value: string, range: string): "H" | "L" | "*" {
  const bounds = /(-?\d+(?:\.\d+)?)\s*[–—-]\s*(-?\d+(?:\.\d+)?)/.exec(range ?? "");
  const n = Number(String(value ?? "").trim());
  if (!bounds || !Number.isFinite(n)) return "*";

  const min = Number(bounds[1]);
  const max = Number(bounds[2]);
  if (n > max) return "H";
  if (n < min) return "L";
  return "*";
}
