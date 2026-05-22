import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      {/* soft clinical backdrop */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-brand-50 via-slate-100 to-slate-200" />
      <div
        className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-brand-100 opacity-50 blur-3xl"
        aria-hidden
      />
      <div className="relative w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand text-white shadow-lg shadow-brand/20">
            <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M9 3v6.5L4.5 18a2 2 0 0 0 1.8 3h11.4a2 2 0 0 0 1.8-3L15 9.5V3" />
              <path d="M8 3h8M8 13h8" />
            </svg>
          </span>
          <h1 className="text-xl font-extrabold tracking-tight text-slate-900">Golmuri Janch Ghar</h1>
          <p className="mt-1 text-sm text-slate-500">Staff Admin Portal</p>
        </div>
        <div className="card p-6 shadow-md">
          <LoginForm />
        </div>
        <p className="mt-4 text-center text-xs text-slate-400">Use your lab username and password.</p>
      </div>
    </main>
  );
}
