import { vi } from "vitest";

// React's `cache` is an RSC-only export; React 18.3's node build returns
// `undefined`, so any module that does `import { cache } from "react"` throws
// at import time under vitest. Shim it to an identity wrapper for tests.
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, cache: actual.cache ?? (<T,>(fn: T): T => fn) };
});
