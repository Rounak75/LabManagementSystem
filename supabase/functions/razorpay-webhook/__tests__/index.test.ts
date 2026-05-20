import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { verifyHmac } from "../signature.ts";

Deno.test("verifyHmac: valid signature passes", async () => {
  const secret = "shhh";
  const body = '{"event":"payment.captured"}';
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  const sig = Array.from(new Uint8Array(sigBuf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  assert(await verifyHmac(body, sig, secret));
});

Deno.test("verifyHmac: bad signature fails", async () => {
  assertEquals(await verifyHmac("body", "badsig", "secret"), false);
});

Deno.test("verifyHmac: different length fails fast", async () => {
  assertEquals(await verifyHmac("body", "short", "secret"), false);
});
