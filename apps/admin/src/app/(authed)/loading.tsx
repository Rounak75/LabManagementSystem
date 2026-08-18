export default function Loading() {
  // The ring was `border-t-indigo-600` — a colour that appears nowhere else in
  // this app and is not in the palette. It is the brand teal now.
  return (
    <div role="status" className="flex min-h-[50vh] flex-col items-center justify-center p-8">
      <div
        aria-hidden="true"
        className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-brand"
      ></div>
      <p className="mt-4 text-sm font-medium text-slate-600">Loading…</p>
    </div>
  );
}
