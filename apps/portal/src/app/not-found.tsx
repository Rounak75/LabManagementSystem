import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-xl font-semibold text-gray-800">Page not found</h1>
      <p className="text-gray-500">The page you were looking for doesn’t exist.</p>
      <Link href="/dashboard" className="rounded-md bg-gray-800 px-4 py-2 text-white hover:bg-gray-700">
        Go to dashboard
      </Link>
    </div>
  );
}
