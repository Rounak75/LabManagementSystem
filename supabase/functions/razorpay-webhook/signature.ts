export async function verifyHmac(rawBody: string, signature: string, secret: string): Promise<boolean> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(rawBody));
  const computed = Array.from(new Uint8Array(sigBuf))
    .map((b) => b.toString(16).padStart(2, "0")).join("");
  if (computed.length !== signature.length) return false;
  let ok = 0;
  for (let i = 0; i < computed.length; i++) ok |= computed.charCodeAt(i) ^ signature.charCodeAt(i);
  return ok === 0;
}
