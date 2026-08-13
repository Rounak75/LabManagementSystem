// The admin portal's Content-Security-Policy. The portal has its own copy at
// `apps/portal/src/lib/security-headers.ts`, and they are deliberately separate
// files rather than a shared package: the two apps face different people (the
// public versus three members of staff) and their policies are allowed to
// diverge. Anything changed here for a *security* reason almost certainly wants
// changing there too — check both.
//
// The static headers live in `next.config.mjs`, because a config `headers()`
// block covers `/api/*`, which the middleware matcher does not.

/**
 * Sources the browser may open connections to.
 *
 * `'self'` alone, and that is checked rather than assumed: every Supabase call
 * in this app goes through `getServerSupabase`, which runs on the server. The
 * staff member's browser never holds the anon key and never talks to Supabase
 * directly, so it does not need permission to.
 */
const CONNECT_SRC = "'self'";

export interface CspOptions {
  /** Dev needs `'unsafe-eval'` for React Refresh. Never true in production. */
  dev?: boolean;
}

/**
 * The policy for one request.
 *
 * Stricter than the portal's in one place: there is no inline `<script>` in this
 * app at all, so nothing here relies on the nonce reaching a hand-written tag.
 * The nonce exists purely so Next's own hydration scripts can be allowed without
 * opening the door to `'unsafe-inline'`.
 */
export function buildCsp(nonce: string, { dev = false }: CspOptions = {}): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    // As in the portal: React writes `style="..."` attributes that a nonce does
    // not cover, and the failure mode is a broken layout on a phone rather than
    // a security hole. Injected CSS is a much narrower problem than injected JS.
    "style-src 'self' 'unsafe-inline'",
    // `blob:` for the report PDF the print route streams back.
    "img-src 'self' blob: data:",
    "font-src 'self'",
    `connect-src ${CONNECT_SRC}`,
    "object-src 'none'",
    "base-uri 'self'",
    // Staff sign in here and approve payments here. A form on this origin posts
    // back to this origin or nowhere.
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

/** A fresh nonce. One per request — reuse across requests defeats the point. */
export function generateNonce(): string {
  return Buffer.from(crypto.randomUUID()).toString("base64");
}
