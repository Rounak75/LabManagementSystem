// Headers whose value never changes. The CSP is deliberately not among them —
// it carries a per-request nonce, which a static config cannot produce; see
// `src/lib/security-headers.ts`. Applied to every path including `/api/*`,
// which the middleware matcher skips.
//
// Kept in step with the portal's copy in `apps/portal/next.config.mjs`. The one
// difference is Permissions-Policy: staff phones are the intended device here,
// so a future "scan the barcode on the sample tube" feature would need `camera`
// opened. It is closed until something actually asks for it.
const SECURITY_HEADERS = [
  // Two years, subdomains included. No `preload`: that submits the domain to a
  // list compiled into browser binaries, which is slow to enter and very slow
  // to leave, and is not a decision to make as a side effect of this change.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // `frame-ancestors 'none'` in the CSP is the real rule; this is the same
  // instruction for browsers too old to honour that directive.
  { key: "X-Frame-Options", value: "DENY" },
  // Patient IDs and visit IDs sit in the path on most of these pages. Sending a
  // full URL as a referrer to another origin would hand those over; origin-only
  // does not.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
  experimental: {
    // Dynamic routes (these all read cookies) default to staleTimes.dynamic = 0,
    // so the client router cache discards prefetched pages and every click does a
    // fresh server roundtrip — the main source of the navigation lag. Letting the
    // client reuse a prefetched/visited page for 30s makes navigation instant.
    // Server data is still unstable_cache'd + tag-revalidated, so writes stay fresh.
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
};
export default nextConfig;
