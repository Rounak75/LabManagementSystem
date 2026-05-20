export function formatINR(amount: number): string {
  const rounded = Math.round(amount);
  return "₹" + rounded.toLocaleString("en-IN");
}
export function formatPhone(p: string): string {
  if (p?.length === 10) return `${p.slice(0, 5)} ${p.slice(5)}`;
  return p;
}
export function formatDateShort(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
