// Run via: deno test --allow-net --allow-env reserve-visit-id/test.ts
import { assertEquals, assertMatch } from "https://deno.land/std@0.220.0/assert/mod.ts";

const URL = Deno.env.get("SUPABASE_TEST_URL")! + "/functions/v1/reserve-visit-id";
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

Deno.test("returns VIS-2026-NNNNN for valid request", async () => {
  const r = await callFn({ kind: "VIS", year: 2026, userId: "test-user" });
  assertEquals(r.status, 200);
  const j = await r.json();
  assertMatch(j.allocatedId, /^VIS-2026-\d{5}$/);
});

Deno.test("rejects missing userId", async () => {
  const r = await callFn({ kind: "VIS", year: 2026 });
  await r.body?.cancel();
  assertEquals(r.status, 400);
});

Deno.test("concurrent calls do not collide", async () => {
  const calls = await Promise.all([
    callFn({ kind: "VIS", year: 2026, userId: "u1" }),
    callFn({ kind: "VIS", year: 2026, userId: "u2" }),
    callFn({ kind: "VIS", year: 2026, userId: "u3" }),
  ]);
  const ids = await Promise.all(calls.map((r) => r.json().then((j: { allocatedId: string }) => j.allocatedId)));
  assertEquals(new Set(ids).size, 3);
});
