import { vi } from "vitest";

export type Captured = { table: string; method: string; arg: unknown };
type ResultSpec =
  | { data?: unknown; error?: unknown }
  | ((ctx: { table: string; methods: string[] }) => { data?: unknown; error?: unknown });

/** Chainable Supabase-like stub. Records every {table, method, arg} in `calls`.
 *  Terminal resolves to a fixed result, or a per-call resolver for read-then-write routes. */
export function makeSupabaseStub(result: ResultSpec = { data: null, error: null }) {
  const calls: Captured[] = [];
  const builder = (table: string): any => {
    const methods: string[] = [];
    const make = (method: string) => (arg?: unknown) => {
      calls.push({ table, method, arg }); methods.push(method); return chain;
    };
    const resolve = () => (typeof result === "function" ? result({ table, methods }) : result);
    const chain: any = {
      insert: make("insert"), update: make("update"), delete: make("delete"),
      upsert: make("upsert"), select: make("select"), eq: make("eq"), in: make("in"),
      not: make("not"), single: make("single"), maybeSingle: make("maybeSingle"),
      order: make("order"), limit: make("limit"),
      then: (onF: any, onR: any) => Promise.resolve(resolve()).then(onF, onR),
    };
    return chain;
  };
  const client = { from: vi.fn((t: string) => builder(t)) };
  return { client, calls };
}
