import { getSessionUser } from "@/lib/auth-session";
import { listOpenPaymentClaims } from "@/lib/data-payments";
import { ClaimRow } from "./ClaimRow";
import { PageHeader } from "@/components/PageHeader";

export default async function ClaimsPage() {
  const user = (await getSessionUser())!;
  const claims = await listOpenPaymentClaims(user.token);
  return (
    <div>
      <PageHeader
        title="Payment claims"
        subtitle="Patients who tapped “I already paid” on the portal — a heads-up only. Record the actual payment from the Payments page."
      />
      {claims.length === 0 ? (
        <div className="card p-8 text-center text-sm text-slate-500">No open claims.</div>
      ) : (
        <ul className="card divide-y divide-slate-100 overflow-hidden">
          {claims.map((c) => (
            <ClaimRow key={c.id as string} claim={c} />
          ))}
        </ul>
      )}
    </div>
  );
}
