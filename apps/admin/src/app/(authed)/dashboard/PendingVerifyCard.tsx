import Link from "next/link";
import { countPendingVerify } from "@/lib/data-visits";

export async function PendingVerifyCard({ jwt, isAdmin }: { jwt: string; isAdmin: boolean }) {
  if (!isAdmin) return null;
  const n = await countPendingVerify(jwt);
  if (n === 0) {
    return (
      <div className="bg-green-50 border border-green-200 rounded p-4 text-sm text-green-800">
        ✓ No visits awaiting verify.
      </div>
    );
  }
  return (
    <Link
      href="/visits?status=PendingVerify"
      className="block bg-yellow-50 border border-yellow-300 rounded p-4 hover:bg-yellow-100"
    >
      <div className="text-lg font-semibold text-yellow-900">
        {n} visit{n > 1 ? "s" : ""} awaiting your verify
      </div>
      <div className="text-sm text-yellow-800">Tap to review and verify.</div>
    </Link>
  );
}
