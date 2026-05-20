import { assertEquals } from "https://deno.land/std@0.220.0/assert/mod.ts";

const URL = Deno.env.get("SUPABASE_TEST_URL")! + "/functions/v1/auth-login";
const ANON = Deno.env.get("SUPABASE_TEST_ANON_KEY")!;

async function callFn(body: unknown) {
  return await fetch(URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ANON}`,
    },
    body: JSON.stringify(body),
  });
}

Deno.test("returns token + user for valid credentials", async () => {
  const r = await callFn({ username: "testfather", password: "password123" });
  assertEquals(r.status, 200);
  const j = await r.json();
  assertEquals(j.user.role, "Admin");
  assertEquals(typeof j.token, "string");
});

Deno.test("rejects wrong password", async () => {
  const r = await callFn({ username: "testfather", password: "wrong" });
  await r.body?.cancel();
  assertEquals(r.status, 401);
});

Deno.test("rejects missing username", async () => {
  const r = await callFn({ password: "x" });
  await r.body?.cancel();
  assertEquals(r.status, 400);
});

Deno.test("locks out after 5 failed attempts", async () => {
  for (let i = 0; i < 5; i++) {
    const fr = await callFn({ username: "testfather", password: "wrong" });
    await fr.body?.cancel();
  }
  const r = await callFn({ username: "testfather", password: "password123" });
  await r.body?.cancel();
  assertEquals(r.status, 423);
});
