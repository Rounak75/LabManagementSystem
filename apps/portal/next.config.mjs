// Headers whose value never changes, so they can be declared once here rather
// than rebuilt per request in the middleware. The CSP is deliberately *not* in
// this list — it carries a per-request nonce, which a static config cannot
// produce; see `src/lib/security-headers.ts`.
//
// Applied to every path including `/api/*`, which the middleware matcher skips.
// An API route returning JSON still wants `nosniff` on it.
const SECURITY_HEADERS = [
  // Two years, and subdomains with it. No `preload`: that submits the domain to
  // a list baked into browser binaries, which is slow to enter and very slow to
  // leave, and it is not the lab's decision to make on a Tuesday afternoon.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  // Stops the browser second-guessing a Content-Type. The report route serves
  // application/pdf and the API routes serve JSON; neither should ever be
  // sniffed into something executable.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // `frame-ancestors 'none'` in the CSP is the real rule. This is the same
  // instruction for browsers too old to honour that directive, and costs a header.
  { key: "X-Frame-Options", value: "DENY" },
  // A patient ID sits in the path on visit and invoice pages. Sending a full
  // URL to another origin as a referrer would hand that ID to whatever they
  // clicked through to; origin-only does not.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // The portal asks for none of these, so nothing on the page — injected or
  // otherwise — may prompt the patient for them.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
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
