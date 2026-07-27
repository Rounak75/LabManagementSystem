// Is the desktop still pushing?
//
// The lab PC is the master copy; both portals are read surfaces fed by its
// outbox worker. If that worker wedges — a bad row, a dead network, the app
// simply closed — the cloud keeps serving whatever it last received and nothing
// anywhere says so. Staff go on entering results against a stale picture, and
// patients see reports that are no longer current.
//
// The desktop already writes `cloud_heartbeat.last_pushed_at` on every sync
// tick, so the signal exists. This turns it into something someone sees.

/** How quiet the heartbeat has to go before staff are told. */
export const SYNC_STALE_AFTER_MINUTES = 30;

export type SyncStaleness =
  | { state: "fresh" }
  | { state: "stale"; minutes: number }
  | { state: "unknown" };

export function syncStaleness(lastPushedAt: string | null, now: Date): SyncStaleness {
  // No row at all means the desktop has never pushed — a deployment where cloud
  // sync was never switched on. Reporting that as "0 minutes ago" would be false.
  if (!lastPushedAt) return { state: "unknown" };

  const pushed = new Date(lastPushedAt);
  if (Number.isNaN(pushed.getTime())) return { state: "unknown" };

  const minutes = Math.floor((now.getTime() - pushed.getTime()) / 60_000);

  // A timestamp slightly in the future is clock skew between the lab PC and
  // Postgres, not an outage.
  if (minutes < SYNC_STALE_AFTER_MINUTES) return { state: "fresh" };

  return { state: "stale", minutes };
}

/** Plain-language summary for the banner. */
export function describeStaleness(staleness: SyncStaleness): string | null {
  if (staleness.state === "fresh") return null;
  if (staleness.state === "unknown") {
    return "The lab desktop has never synced to the cloud. Results entered here may not reach it.";
  }

  const { minutes } = staleness;
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  const ago =
    days >= 1 ? `${days} day${days > 1 ? "s" : ""}`
    : hours >= 1 ? `${hours} hour${hours > 1 ? "s" : ""}`
    : `${minutes} minutes`;

  return `The lab desktop last synced ${ago} ago. What you see here may be out of date — check that the desktop app is running.`;
}
