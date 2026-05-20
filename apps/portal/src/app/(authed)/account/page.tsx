import Link from "next/link";
import { LogoutButton } from "./LogoutButton";

export default function AccountPage() {
  return (
    <div className="mt-2 space-y-2">
      <h1 className="text-xl font-semibold">Account</h1>
      <Link href="/account/password" className="block bg-white border rounded p-3 hover:bg-slate-50">
        Set or change password
      </Link>
      <Link href="/account/dispute" className="block bg-white border rounded p-3 hover:bg-slate-50">
        This isn't me
      </Link>
      <LogoutButton />
    </div>
  );
}
