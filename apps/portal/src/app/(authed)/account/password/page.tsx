"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function PasswordPage() {
  const router = useRouter();
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (pw !== confirm) { setError("Passwords don't match."); return; }
    if (pw.length < 8) { setError("Password must be at least 8 characters."); return; }
    const res = await fetch("/api/auth/set-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pw }),
    });
    if (res.ok) { setDone(true); setTimeout(() => router.push("/account"), 1500); }
    else setError("Could not set password. Please try again.");
  }

  if (done) return (
    <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded text-green-800">
      Password set. Redirecting to your account…
    </div>
  );

  return (
    <div className="max-w-md mx-auto mt-6">
      <h1 className="text-xl font-semibold mb-4">Set a password</h1>
      <p className="text-sm text-gray-600 mb-4">
        After you set a password, future logins can use either your password or your receipt code.
      </p>
      <form onSubmit={handleSubmit} className="space-y-3 bg-white p-6 rounded border border-gray-200">
        <label className="block">
          <span className="text-sm font-medium">New password (min 8 characters)</span>
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} required minLength={8}
            className="mt-1 block w-full rounded border-gray-300" />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Confirm password</span>
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required
            className="mt-1 block w-full rounded border-gray-300" />
        </label>
        {error && <div className="bg-red-50 border border-red-200 text-red-800 text-sm p-3 rounded">{error}</div>}
        <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded font-medium">
          Set password
        </button>
      </form>
    </div>
  );
}
