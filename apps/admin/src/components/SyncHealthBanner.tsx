import { getServerSupabase } from "@/lib/supabase-client";
import { describeStaleness, syncStaleness } from "@/lib/sync-health";

/**
 * Warns staff when the lab desktop has stopped syncing.
 *
 * Distinct from OfflineBanner, which is about *this device's* connection. This
 * is about the master copy: the phone can be perfectly online and still be
 * showing results the desktop stopped updating hours ago.
 *
 * Renders nothing when sync is healthy, so it costs the daily user nothing.
 */
export async function SyncHealthBanner({ token }: { token: string }) {
  let lastPushedAt: string | null = null;
  try {
    const sb = getServerSupabase(token);
    const { data } = await sb
      .from("cloud_heartbeat")
      .select("last_pushed_at")
      .maybeSingle();
    lastPushedAt = (data as { last_pushed_at?: string } | null)?.last_pushed_at ?? null;
  } catch {
    // A monitoring banner must never be the thing that takes the portal down.
    return null;
  }

  const message = describeStaleness(syncStaleness(lastPushedAt, new Date()));
  if (!message) return null;

  return (
    <div className="bg-rose-100 text-rose-900">
      <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-2 text-sm font-medium">
        <span className="h-2 w-2 shrink-0 rounded-full bg-rose-500" />
        <span>{message}</span>
      </div>
    </div>
  );
}
