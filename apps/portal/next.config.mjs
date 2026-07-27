/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Allow importing from monorepo workspaces (esp. @lab/reports).
  transpilePackages: ["@lab/reports"],
  experimental: {
    // Pinned to what Next 14 defaulted to. Next 15 changed the default for
    // `dynamic` from 30 to 0, which would have silently made every navigation
    // between the portal's dynamic pages (dashboard, invoices, visits) a fresh
    // server round-trip instead of reusing the prefetched page. Patients open
    // this on phones over mobile data, so that is a latency regression nobody
    // asked for — and it would have arrived as a side effect of a version bump.
    // The admin app pins the same setting deliberately; this makes the portal
    // explicit rather than at the mercy of a default.
    staleTimes: {
      dynamic: 30,
      static: 300,
    },
  },
};
export default nextConfig;
