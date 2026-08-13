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
      <h1 className="text-xl font-semibold text-gray-800">Page not found</h1>
      <p className="text-gray-500">That page doesn’t exist.</p>
      <Link href="/dashboard" className="rounded-md bg-gray-800 px-4 py-2 text-white hover:bg-gray-700">Go to dashboard</Link>
    </div>
  );
}
