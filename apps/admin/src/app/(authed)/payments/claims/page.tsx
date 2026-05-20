import { getSessionUser } from "@/lib/auth-session";
import { listOpenPaymentClaims } from "@/lib/data-payments";
import { ClaimRow } from "./ClaimRow";

export default async function ClaimsPage() {
  const user = (await getSessionUser())!;
  const claims = await listOpenPaymentClaims(user.token);
  return (
    <div>
      <h1 className="text-2xl font-semibold mb-1">Payment claims</h1>
      <p className="text-sm text-gray-500 mb-4">
        Patients who tapped &ldquo;I already paid&rdquo; on the portal. This is a heads-up only — record the
        actual payment from the <strong>Payments</strong> page.
      </p>
      {claims.length === 0 ? (
        <p className="text-sm text-gray-500">No open claims.</p>
      ) : (
        <ul className="bg-white rounded border divide-y">
          {claims.map((c) => (
            <ClaimRow key={c.id as string} claim={c} />
          ))}
        </ul>
      )}
    </div>
  );
}
