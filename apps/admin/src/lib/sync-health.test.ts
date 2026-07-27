import { describe, it, expect } from "vitest";
import { SYNC_STALE_AFTER_MINUTES, syncStaleness } from "./sync-health";

const now = new Date("2026-07-27T12:00:00.000Z");
const minutesAgo = (n: number) => new Date(now.getTime() - n * 60_000).toISOString();

describe("syncStaleness", () => {
  it("is fresh when the desktop pushed moments ago", () => {
    expect(syncStaleness(minutesAgo(1), now)).toEqual({ state: "fresh" });
  });

  it("is still fresh just inside the threshold", () => {
    expect(syncStaleness(minutesAgo(SYNC_STALE_AFTER_MINUTES - 1), now)).toEqual({ state: "fresh" });
  });

  // The failure this exists to surface: the outbox wedges, the desktop stops
  // pushing, and both portals go on serving whatever they last received. Nothing
  // in the system says so — staff keep working from stale results.
  it("is stale once the threshold has passed", () => {
    const result = syncStaleness(minutesAgo(SYNC_STALE_AFTER_MINUTES + 1), now);

    expect(result.state).toBe("stale");
  });

  it("says how long it has been", () => {
    expect(syncStaleness(minutesAgo(90), now)).toMatchObject({ state: "stale", minutes: 90 });
  });

  it("reports a multi-day outage in whole minutes", () => {
    expect(syncStaleness(minutesAgo(60 * 24 * 3), now)).toMatchObject({ state: "stale", minutes: 4320 });
  });

  // A missing row means the desktop has never pushed — a fresh deployment that
  // was never switched on. That is not the same as a sync that has stopped, and
  // claiming "0 minutes ago" would be a lie.
  it("is unknown when the desktop has never pushed", () => {
    expect(syncStaleness(null, now)).toEqual({ state: "unknown" });
  });

  it("is unknown rather than fresh for an unparseable timestamp", () => {
    expect(syncStaleness("not-a-date", now)).toEqual({ state: "unknown" });
  });

  // Clock skew between the lab PC and Postgres should not read as an outage.
  it("treats a slightly future timestamp as fresh", () => {
    expect(syncStaleness(minutesAgo(-2), now)).toEqual({ state: "fresh" });
  });
});
