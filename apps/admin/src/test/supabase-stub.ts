import { vi } from "vitest";

// `args` carries every argument, not just the first. Without it a test can
// see that `.eq()` was called but not what it was called *with* — so a route
// querying the wrong id, or `undefined`, looks identical to a correct one.
export type Captured = { table: string; method: string; arg: unknown; args: unknown[] };
type ResultSpec =
  | { data?: unknown; error?: unknown }
  | ((ctx: { table: string; methods: string[] }) => { data?: unknown; error?: unknown });

/** Chainable Supabase-like stub. Records every {table, method, arg} in `calls`.
 *  Terminal resolves to a fixed result, or a per-call resolver for read-then-write routes. */
export function makeSupabaseStub(result: ResultSpec = { data: null, error: null }) {
  const calls: Captured[] = [];
  const builder = (table: string): any => {
    const methods: string[] = [];
    const make = (method: string) => (...args: unknown[]) => {
      calls.push({ table, method, arg: args[0], args }); methods.push(method); return chain;
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
  const rpcCalls: { name: string; args: unknown }[] = [];
  const client = {
    from: vi.fn((t: string) => builder(t)),
    // Operations that must be atomic (invoice balances, lockout counters) run as
    // Postgres functions rather than read-modify-write, so the stub models them.
    rpc: vi.fn(async (name: string, args?: unknown) => {
      rpcCalls.push({ name, args });
      const spec =
        typeof result === "function" ? result({ table: `rpc:${name}`, methods: ["rpc"] }) : result;
      return { data: spec.data ?? null, error: spec.error ?? null };
    }),
  };
  return { client, calls, rpcCalls };
}
