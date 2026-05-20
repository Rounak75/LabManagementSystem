"use client";
import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();
  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }
  return (
    <button
      onClick={handleLogout}
      className="mt-4 px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded text-sm"
    >
      Log out
    </button>
  );
}
