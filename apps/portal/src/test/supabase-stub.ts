import { vi } from "vitest";

export type Captured = { table: string; method: string; arg: unknown };
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
    const make = (method: string) => (arg?: unknown) => {
      calls.push({ table, method, arg });
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
  const client = { from: vi.fn((t: string) => builder(t)) };
  return { client, calls };
}
