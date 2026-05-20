import { unstable_cache } from "next/cache";
import { getServerSupabase } from "./supabase-client";
import { CACHE_TAGS } from "./cache-tags";

const _listUnpaidInvoices = unstable_cache(
  async (jwt: string) => {
    const sb = getServerSupabase(jwt);
    const { data, error } = await sb
      .from("invoices")
      .select(`
        id, total, amount_paid, payment_status, created_at, visit_id,
        visits(visit_id, patients(name, phone, patient_id))
      `)
      .in("payment_status", ["Pending", "Partial"])
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  },
  ["payments-unpaid"],
  { tags: [CACHE_TAGS.payments], revalidate: 60 },
);

export function listUnpaidInvoices(jwt: string) {
  return _listUnpaidInvoices(jwt);
}

const _listOpenPaymentClaims = unstable_cache(
  async (jwt: string) => {
    const sb = getServerSupabase(jwt);
    const { data, error } = await sb
      .from("payment_claims")
      .select(`
        id, invoice_id, claimed_at, expires_at, status,
        invoices(total, visits(visit_id, patients(name, phone)))
      `)
      .eq("status", "Open")
      .order("claimed_at", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  },
  ["payments-open-claims"],
  { tags: [CACHE_TAGS.payments], revalidate: 60 },
);

export function listOpenPaymentClaims(jwt: string) {
  return _listOpenPaymentClaims(jwt);
}
