import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/Card";
import { call } from "@/lib/api";
import type { BackupHealth } from "@shared/api";

/**
 * The backup alarm, on the screen the owner actually looks at.
 *
 * Backups had no presence outside Settings → Backup, which is a page you only
 * open if you already suspect something. The case that needs saying out loud is
 * the quiet one: a run whose off-machine copy failed is logged "partial" and
 * still advances `lastBackupAt`, so the app stops asking for a backup and the
 * USB stick can stay unplugged indefinitely while the only surviving copy of the
 * lab's records sits on the same disk as the live database.
 *
 * Nothing renders while backups are healthy — see the test for why.
 */
export function BackupStatusCard() {
  const { data } = useQuery({
    queryKey: ["backup", "health"],
    queryFn: () => call<BackupHealth>("backup:getHealth", {}),
    refetchInterval: 5 * 60_000,
  });

  if (!data || data.tone === "ok") return null;

  const alarm = data.tone === "alarm";

  return (
    <Card
      className={`mb-4 border-l-4 ${alarm ? "border-rose-500" : "border-amber-500"}`}
      // Announced rather than merely coloured: the lab runs this on one screen
      // that is often read at a glance from across the room.
      role={alarm ? "alert" : "status"}
    >
      <div className={`text-sm font-medium ${alarm ? "text-rose-700" : "text-amber-700"}`}>
        {data.headline}
      </div>
      {data.detail ? <div className="mt-1 text-xs text-slate-600">{data.detail}</div> : null}
    </Card>
  );
}
