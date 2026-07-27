import { vi } from "vitest";

// `args` carries every argument, not just the first. Without it a test can
// see that `.eq()` was called but not what it was called *with* — so a route
// querying the wrong id, or `undefined`, looks identical to a correct one.
export type Captured = { table: string; method: string; arg: unknown; args: unknown[] };
export type StubResult = { data?: unknown; error?: unknown };
/** Either a single fixed result for every query, or a per-table resolver.
 *  When a function is passed it receives the table name and the methods called
 *  on that chain so far, letting one stub serve reads and writes differently. */
export type ResultSpec = StubResult | ((ctx: { table: string; methods: string[] }) => StubResult);

/** Chainable Supabase-like stub. Records every table/method call in `calls`.
 *  Terminal methods resolve to { data, error } from `result`. */
export function makeSupabaseStub(result: ResultSpec = { data: null, error: null }) {
  const calls: Captured[] = [];
  const builder = (table: string): any => {
    const methods: string[] = [];
    const resolve = () =>
      typeof result === "function" ? result({ table, methods }) : result;
    const make = (method: string) => (...args: unknown[]) => {
      calls.push({ table, method, arg: args[0], args });
      methods.push(method);
      return chain;
    };
    const chain: any = {
      insert: make("insert"), update: make("update"), delete: make("delete"),
      select: make("select"), eq: make("eq"), in: make("in"), not: make("not"),
      single: make("single"), maybeSingle: make("maybeSingle"),
      order: make("order"), limit: make("limit"),
      then: (onF: any, onR: any) => Promise.resolve(resolve()).then(onF, onR),
    };
    return chain;
  };
  const rpcCalls: { name: string; args: unknown }[] = [];
  const client = {
    from: vi.fn((t: string) => builder(t)),
    // Atomic counter updates (login lockout) go through RPCs rather than a
    // read-modify-write, so the stub has to model them.
    rpc: vi.fn(async (name: string, args?: unknown) => {
      rpcCalls.push({ name, args });
      const spec = typeof result === "function" ? result({ table: `rpc:${name}`, methods: ["rpc"] }) : result;
      return { data: spec.data ?? null, error: spec.error ?? null };
    }),
  };
  return { client, calls, rpcCalls };
}
