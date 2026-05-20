import { ItemStatus } from "@/lib/offline-queue";

export function SyncChip({ status }: { status: ItemStatus | "Synced" }) {
  const cls =
    status === ItemStatus.Pending ? "bg-gray-100 text-gray-700" :
    status === ItemStatus.Error ? "bg-red-100 text-red-700" :
    "bg-green-100 text-green-700";
  const label =
    status === ItemStatus.Pending ? "⏱ Pending" :
    status === ItemStatus.Error ? "⚠ Error" :
    "✓ Synced";
  return <span className={`text-xs rounded px-2 py-0.5 ${cls}`}>{label}</span>;
}
