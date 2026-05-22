"use client";
import { useState, useTransition } from "react";

export function PasswordForm() {
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setMsg(null);
        startTransition(async () => {
          const r = await fetch("/api/settings/password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ oldPassword: oldPw, newPassword: newPw }),
          });
          if (r.ok) {
            setMsg({ kind: "ok", text: "Password changed." });
            setOldPw("");
            setNewPw("");
          } else {
            const text = await r.text();
            setMsg({ kind: "err", text: text || "Could not change password." });
          }
        });
      }}
      className="space-y-3 max-w-xs"
    >
      <label className="block text-sm">
        Current password
        <input
          type="password"
          value={oldPw}
          onChange={(e) => setOldPw(e.target.value)}
          className="input mt-1.5"
          required
        />
      </label>
      <label className="block text-sm">
        New password (≥ 8 chars)
        <input
          type="password"
          value={newPw}
          onChange={(e) => setNewPw(e.target.value)}
          minLength={8}
          className="input mt-1.5"
          required
        />
      </label>
      <button disabled={pending} className="btn-primary">
        {pending ? "Changing…" : "Change password"}
      </button>
      {msg && <p className={`text-sm font-medium ${msg.kind === "ok" ? "text-emerald-700" : "text-rose-700"}`}>{msg.text}</p>}
    </form>
  );
}
