import { getServerSupabase } from "./supabase-client";

export type BookingStatus = "Pending" | "Approved" | "Declined" | "Cancelled" | "Completed";

export async function listBookings(jwt: string, status: BookingStatus = "Pending") {
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
}

export async function listPhlebotomists(jwt: string) {
  const sb = getServerSupabase(jwt);
  const { data, error } = await sb
    .from("users")
    .select("id, name")
    .eq("can_collect_samples", true)
    .eq("is_active", true)
    .order("name");
  if (error) throw new Error(error.message);
  return data ?? [];
}
