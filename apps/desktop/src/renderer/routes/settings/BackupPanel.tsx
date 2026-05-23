import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { call } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import type { BackupLogRow } from "@shared/api";

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "—";
  if (n < 1024) return "<1 KB";
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1048576).toFixed(2)} MB`;
}

function truncatePath(p: string, max = 48): string {
  if (!p) return "";
  if (p.length <= max) return p;
  return "…" + p.slice(p.length - (max - 1));
}

function formatDate(d: string | Date): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) return String(d);
  return dt.toLocaleString();
}

function fileNameOf(p: string): string {
  if (!p) return "";
  const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return i >= 0 ? p.slice(i + 1) : p;
}

export function BackupPanel() {
  const qc = useQueryClient();

  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: () => call<any>("settings:get"),
  });

  const { data: backups } = useQuery<BackupLogRow[]>({
    queryKey: ["backups"],
    queryFn: () => call<BackupLogRow[]>("backup:list"),
  });

  const [backupTime, setBackupTime] = useState<string>("02:00");
  const [retention, setRetention] = useState<number>(14);
  const [scheduleDirty, setScheduleDirty] = useState(false);
  const [runStatus, setRunStatus] = useState<{ kind: "idle" | "running" | "success" | "error"; message?: string }>({ kind: "idle" });
  const [confirmRow, setConfirmRow] = useState<BackupLogRow | null>(null);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setBackupTime(settings.backupTime ?? "02:00");
    setRetention(Number(settings.backupRetentionDays ?? 14));
    setScheduleDirty(false);
  }, [settings]);

  const saveSettings = useMutation({
    mutationFn: (patch: Record<string, unknown>) => call("settings:update", patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings"] }),
  });

  const runNow = useMutation({
    mutationFn: () => call<BackupLogRow>("backup:runNow"),
    onMutate: () => setRunStatus({ kind: "running" }),
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ["backups"] });
      if (row.status === "success") {
        setRunStatus({ kind: "success", message: `Backup saved to ${row.destination}` });
      } else {
        setRunStatus({ kind: "error", message: row.error ?? "Backup failed" });
      }
    },
    onError: (err: any) => {
      setRunStatus({ kind: "error", message: err?.message ?? "Backup failed" });
    },
  });

  const restore = useMutation({
    mutationFn: (id: string) => call<{ ok: true }>("backup:restore", { backupLogId: id }),
  });

  async function handleSaveSchedule() {
    if (!scheduleDirty) return;
    const days = Math.max(1, Math.min(365, Number(retention) || 1));
    await saveSettings.mutateAsync({ backupTime, backupRetentionDays: days });
    setScheduleDirty(false);
  }

  async function handlePickFolder() {
    const result = await call<string | null>("app:pickDirectory");
    if (result) {
      await saveSettings.mutateAsync({ backupPath: result });
    }
  }

  async function handleClearFolder() {
    await saveSettings.mutateAsync({ backupPath: null });
  }

  function handleConfirmRestore() {
    if (!confirmRow) return;
    setRestoring(true);
    restore.mutate(confirmRow.id, {
      onError: (err: any) => {
        setRestoring(false);
        setRunStatus({ kind: "error", message: err?.message ?? "Restore failed" });
        setConfirmRow(null);
      },
    });
  }

  return (
    <Card className="mt-6">
      <h2 className="mb-4 text-xl font-semibold">Backups</h2>

      {/* Schedule */}
      <section className="border-b border-slate-200 pb-5">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-600">Schedule</h3>
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Daily backup time"
            type="time"
            value={backupTime}
            onChange={(e) => { setBackupTime(e.target.value); setScheduleDirty(true); }}
          />
          <Input
            label="Keep backups for (days)"
            type="number"
            min={1}
            max={365}
            value={retention}
            onChange={(e) => { setRetention(Number(e.target.value)); setScheduleDirty(true); }}
          />
        </div>
        <div className="mt-3 flex justify-end">
          <Button type="button" disabled={!scheduleDirty || saveSettings.isPending} onClick={handleSaveSchedule}>
            Save schedule
          </Button>
        </div>
      </section>

      {/* Secondary backup location */}
      <section className="border-b border-slate-200 py-5">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-600">Secondary backup location</h3>
        <p className="mb-3 text-sm text-slate-600">
          Optional copy of each backup written to a second folder (e.g. external drive, network share).
        </p>
        <div className="flex items-center gap-2">
          <div className="flex-1 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            {settings?.backupPath ? settings.backupPath : <span className="text-slate-400">(none)</span>}
          </div>
          <Button type="button" variant="secondary" onClick={handlePickFolder} disabled={saveSettings.isPending}>
            Pick folder…
          </Button>
          {settings?.backupPath && (
            <Button type="button" variant="ghost" onClick={handleClearFolder} disabled={saveSettings.isPending}>
              Clear
            </Button>
          )}
        </div>
      </section>

      {/* Manual backup */}
      <section className="border-b border-slate-200 py-5">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-600">Manual backup</h3>
        <div className="flex items-center gap-3">
          <Button type="button" onClick={() => runNow.mutate()} disabled={runStatus.kind === "running"}>
            Back up now
          </Button>
          {runStatus.kind === "running" && <span className="text-sm text-slate-600">Backing up…</span>}
          {runStatus.kind === "success" && <span className="text-sm text-emerald-700">{runStatus.message}</span>}
          {runStatus.kind === "error" && <span className="text-sm text-danger">{runStatus.message}</span>}
        </div>
      </section>

      {/* History */}
      <section className="pt-5">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-600">History (last 10)</h3>
        {!backups || backups.length === 0 ? (
          <p className="text-sm text-slate-500">No backups yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-600">
                  <th className="py-2 pr-2">Time</th>
                  <th className="py-2 pr-2">Kind</th>
                  <th className="py-2 pr-2">Destination</th>
                  <th className="py-2 pr-2">Size</th>
                  <th className="py-2 pr-2">Status</th>
                  <th className="py-2 pr-2"></th>
                </tr>
              </thead>
              <tbody>
                {backups.map((row) => {
                  const failed = row.status !== "success";
                  return (
                    <tr key={row.id} className={`border-b border-slate-100 ${failed ? "text-danger" : ""}`}>
                      <td className="py-2 pr-2">{formatDate(row.createdAt)}</td>
                      <td className="py-2 pr-2 capitalize">{row.kind}</td>
                      <td className="py-2 pr-2" title={row.destination}>{truncatePath(row.destination)}</td>
                      <td className="py-2 pr-2">{formatBytes(Number(row.sizeBytes))}</td>
                      <td className="py-2 pr-2">{failed ? (row.error ? `Failed: ${row.error}` : "Failed") : "Success"}</td>
                      <td className="py-2 pr-2 text-right">
                        {!failed && (
                          <Button type="button" variant="secondary" onClick={() => setConfirmRow(row)}>
                            Restore
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Restore confirmation */}
      <Modal
        open={!!confirmRow}
        onClose={() => { if (!restoring) setConfirmRow(null); }}
        title="Restore from backup"
      >
        {confirmRow && (
          <div className="space-y-4">
            <p className="text-sm text-slate-700">
              Restore from <span className="font-semibold">{fileNameOf(confirmRow.destination)}</span> taken on{" "}
              <span className="font-semibold">{formatDate(confirmRow.createdAt)}</span>?
            </p>
            <p className="text-sm text-slate-600">
              This will replace your current data with the contents of this backup. The app will restart.
              A safety backup of your current data will be saved first.
            </p>
            {restoring ? (
              <p className="text-sm text-slate-700">Restarting…</p>
            ) : (
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setConfirmRow(null)}>Cancel</Button>
                <Button type="button" variant="danger" onClick={handleConfirmRestore}>Restore</Button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </Card>
  );
}

export default BackupPanel;
