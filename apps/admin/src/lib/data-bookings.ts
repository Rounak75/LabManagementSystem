import { unstable_cache } from "next/cache";
import { getServerSupabase } from "./supabase-client";
import { CACHE_TAGS } from "./cache-tags";

export type BookingStatus = "Pending" | "Approved" | "Declined" | "Cancelled" | "Completed";

const _listBookings = unstable_cache(
  async (jwt: string, status: BookingStatus) => {
    const sb = getServerSupabase(jwt);
    const { data, error } = await sb
      .from("bookings")
      .select(`
        id, booking_id, patient_name, patient_phone, patient_email,
        address, pincode, test_ids, preferred_date, preferred_slot, notes,
        status, decline_reason, approved_by_user_id, assigned_to_user_id, created_at
      `)
      .eq("status", status)
      .order("preferred_date", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  },
  ["bookings-list"],
  { tags: [CACHE_TAGS.bookings], revalidate: 60 },
);

export function listBookings(jwt: string, status: BookingStatus = "Pending") {
  return _listBookings(jwt, status);
}

// Phlebotomists come from the users table, which has no write path in this app —
// cache longer with no tag; time-based revalidation is enough.
const _listPhlebotomists = unstable_cache(
  async (jwt: string) => {
    const sb = getServerSupabase(jwt);
    const { data, error } = await sb
      .from("users")
      .select("id, name")
      .eq("can_collect_samples", true)
      .eq("is_active", true)
      .order("name");
    if (error) throw new Error(error.message);
    return data ?? [];
  },
  ["phlebotomists-list"],
  { revalidate: 300 },
);

export function listPhlebotomists(jwt: string) {
  return _listPhlebotomists(jwt);
}
