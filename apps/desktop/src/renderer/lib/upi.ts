export interface UpiUriInput {
  vpa: string;
  payeeName: string;
  amount: number;
  invoiceId: string;
  note: string;
}

const VPA_RE = /^[a-zA-Z0-9._-]+@[a-zA-Z]+$/;

export function validateVpa(vpa: string): boolean {
  if (!vpa) return false;
  return VPA_RE.test(vpa);
}

export function buildUpiUri(input: UpiUriInput): string {
  if (!input.vpa) throw new Error("VPA is required");
  if (!(input.amount > 0)) throw new Error("amount must be positive");

  const params = new URLSearchParams();
  params.set("pa", input.vpa);
  params.set("pn", input.payeeName);
  params.set("am", input.amount.toFixed(2));
  params.set("cu", "INR");
  params.set("tr", input.invoiceId);
  params.set("tn", input.note);

  return `upi://pay?${params.toString().replace(/\+/g, "%20")}`;
}

export function maskVpa(vpa: string): string {
  if (!validateVpa(vpa)) return vpa;
  const parts = vpa.split("@");
  const user = parts[0]!;
  const bank = parts[1]!;
  if (user.length <= 2) return vpa;
  if (user.length === 3) {
    return `${user[0]}x${user[2]}@${bank}`;
  }
  const first = user.slice(0, 2);
  const last = user.slice(-2);
  const masked = "x".repeat(user.length - 4);
  return `${first}${masked}${last}@${bank}`;
}
