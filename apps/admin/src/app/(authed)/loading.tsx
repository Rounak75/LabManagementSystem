export default function Loading() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center p-8">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-indigo-600"></div>
      <p className="mt-4 text-sm font-medium text-slate-500">Loading...</p>
    </div>
  );
}
