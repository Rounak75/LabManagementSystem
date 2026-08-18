import Link from "next/link";

// Same reason as `login/page.tsx`: prerendered at build time means no per-request
// nonce, and the CSP the middleware sets requires one. Less consequential here —
// a 404 that does not hydrate still reads correctly — but an un-hydrated page is
// one where `<Link>` falls back to a full page load, and leaving one route in the
// app quietly failing its own policy is how the next one gets missed.
export const dynamic = "force-dynamic";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
      {/* Was on the `gray` ramp with an unstyled button; the rest of the app is
          slate and `.btn`. */}
      <h1 className="page-title">Page not found</h1>
      <p className="text-sm text-slate-600">That page doesn’t exist, or the link that led here is out of date.</p>
      <Link href="/dashboard" className="btn-primary">Go to dashboard</Link>
    </div>
  );
}
