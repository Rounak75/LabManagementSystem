"use client";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
        <h1 className="text-xl font-semibold text-gray-800">The page failed to load</h1>
        <p className="max-w-md text-gray-500">Please try again. If this keeps happening, restart the app.</p>
        <button onClick={reset} className="rounded-md bg-gray-800 px-4 py-2 text-white hover:bg-gray-700">Try again</button>
      </body>
    </html>
  );
}
