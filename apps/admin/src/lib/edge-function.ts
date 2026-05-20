const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export interface LoginResponse {
  token: string;
  user: { id: string; username: string; role: "Admin" | "Staff" };
}

export async function callAuthLogin(username: string, password: string): Promise<LoginResponse> {
  const r = await fetch(`${URL}/functions/v1/auth-login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ANON}`,
    },
    body: JSON.stringify({ username, password }),
  });
  if (r.status === 401) throw new Error("INVALID_CREDENTIALS");
  if (r.status === 423) throw new Error("LOCKED_OUT");
  if (r.status === 400) throw new Error("MISSING_FIELDS");
  if (!r.ok) throw new Error(`auth-login error ${r.status}`);
  return (await r.json()) as LoginResponse;
}

export async function callReserveVisitId(
  jwt: string,
  kind: "VIS" | "LAB",
  year: number,
  userId: string,
): Promise<{ reservationId: string; allocatedId: string }> {
  const r = await fetch(`${URL}/functions/v1/reserve-visit-id`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({ kind, year, userId }),
  });
  if (!r.ok) throw new Error(`reserve-visit-id error ${r.status}: ${await r.text()}`);
  return r.json();
}
