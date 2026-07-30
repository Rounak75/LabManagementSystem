"use client";
import { useRouter } from "next/navigation";
import { btnSecondary } from "@portal/components/ui";
import { Logout } from "@portal/components/icons";

export function LogoutButton() {
  const router = useRouter();
  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }
  return (
    <button onClick={handleLogout} className={`${btnSecondary} w-full`}>
      <Logout size={16} />
      Log out
    </button>
  );
}
