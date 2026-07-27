// Claim validation for staff session tokens.
//
// Lives in its own module with no next/headers or caching imports so the edge
// middleware and the server-side session helper can share one implementation
// rather than each doing its own partial check.

/**
 * Rejects a signature-valid token that was not minted for a staff session.
 *
 * The patient portal signs its session tokens with the same SUPABASE_JWT_SECRET,
 * so a valid signature proves only that the token came from this deployment —
 * not that it represents a staff member. A patient's own cookie verified fine and
 * produced a session with `undefined` id and role.
 */
export function assertStaffClaims(payload: Record<string, unknown>): void {
  if (typeof payload.user_id !== "string" || payload.user_id.length === 0) {
    throw new Error("JWT_NOT_A_STAFF_TOKEN: missing user_id");
  }
  if (payload.role_app !== "Admin" && payload.role_app !== "Staff") {
    throw new Error("JWT_NOT_A_STAFF_TOKEN: role_app must be Admin or Staff");
  }
}
