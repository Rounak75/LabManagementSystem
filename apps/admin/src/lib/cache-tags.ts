// Cache tags for unstable_cache reads. Mutation routes call revalidateTag with
// the matching tag so cached list/detail pages refresh immediately after a write.
export const CACHE_TAGS = {
  patients: "patients",
  visits: "visits",
  payments: "payments",
  bookings: "bookings",
  sessionEpoch: "session-epoch",
} as const;
