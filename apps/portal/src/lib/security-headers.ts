// The rules the browser is asked to enforce on the portal's behalf.
//
// Deliberately split across two mechanisms:
//
//  - Everything with a fixed value lives in `next.config.mjs`, because a config
//    `headers()` block covers `/api/*` as well. A JSON error out of an API route
//    still wants `nosniff` on it.
//  - The CSP lives here and is applied by the middleware, because it carries a
//    per-request nonce and a static config file cannot produce one.
//
// Why the nonce is worth the machinery: `layout.tsx` emits an inline script (the
// theme bootstrap, which has to run before first paint), and Next emits inline
// scripts of its own for hydration. Without a nonce the only way to permit those
// is `'unsafe-inline'` — which permits *every* inline script, including the one
// an attacker injects, and leaves `script-src` doing nothing. With a nonce the
// browser runs the scripts this deployment stamped and no others.

/** Sources the browser may open network connections to, beyond the app itself. */
const CONNECT_SRC = [
  "'self'",
  // Nothing else, and that is load-bearing rather than an oversight: every
  // Supabase call in this app is made from the server (`supabase-server.ts` —
  // `getServiceClient` and the anon client are both server-only), so the browser
  // never talks to Supabase directly and does not need to be allowed to.
  //
  // If a browser-side Supabase call is ever added, it fails here first, with a
  // console error naming this directive. Add NEXT_PUBLIC_SUPABASE_URL to this
  // list at that point — do not reach for a wildcard.
].join(" ");

export interface CspOptions {
  /**
   * Development needs `'unsafe-eval'`: React Refresh and the dev-mode bundler
   * both evaluate code at runtime. Never set in production, where nothing does.
   */
  dev?: boolean;
}

/**
 * The Content-Security-Policy for one request.
 *
 * `'strict-dynamic'` is what keeps this maintainable. Without it, every script
 * chunk Next emits would have to be named here, and the list would rot on the
 * next build. With it, a script that carries the nonce may load further scripts,
 * so trust flows from the one nonce this deployment issued rather than from a
 * hand-kept inventory of URLs.
 */
export function buildCsp(nonce: string, { dev = false }: CspOptions = {}): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    // `'unsafe-inline'` on styles, not scripts, and the asymmetry is deliberate.
    // React writes `style="..."` attributes for anything computed at render time,
    // and a nonce does not cover attribute styles — only `<style>` blocks. The
    // alternative is every inline style silently not applying, which on a phone
    // is a broken layout rather than a security win. Injected CSS is a far
    // narrower problem than injected JavaScript, so this is the cheap half.
    "style-src 'self' 'unsafe-inline'",
    // `data:` and `blob:` because the UPI QR code is generated in the browser and
    // the report PDF is streamed to an object URL rather than fetched from a host.
    "img-src 'self' blob: data:",
    // `next/font` self-hosts Google Fonts at build time, so no external font host
    // needs naming here — the files come off this origin like everything else.
    "font-src 'self'",
    `connect-src ${CONNECT_SRC}`,
    // The report PDF opens in an iframe/object on some phone browsers.
    "object-src 'none'",
    "base-uri 'self'",
    // A form on this origin may only post back to it. Stops an injected form
    // from quietly shipping a patient's password somewhere else.
    "form-action 'self'",
    // Nobody may frame the portal. This is the clickjacking defence that
    // actually matters — a framed portal with an invisible overlay is how a
    // patient is tricked into clicking "release my report".
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

/** A fresh nonce. One per request — reuse across requests defeats the point. */
export function generateNonce(): string {
  return Buffer.from(crypto.randomUUID()).toString("base64");
}
