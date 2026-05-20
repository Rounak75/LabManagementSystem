"use client";
import { useState, useTransition } from "react";
import { loginAction } from "./actions";

export function LoginForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        const fd = new FormData(e.currentTarget);
        startTransition(async () => {
          const res = await loginAction(fd);
          if (res?.error) setError(res.error);
        });
      }}
      className="space-y-4"
    >
      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="username">Username</label>
        <input
          id="username"
          name="username"
          autoComplete="username"
          required
          className="w-full border rounded px-3 py-2"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="w-full border rounded px-3 py-2"
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded py-2 font-medium"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
