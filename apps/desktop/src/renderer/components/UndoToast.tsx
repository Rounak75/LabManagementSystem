import { useEffect, useState } from "react";
import { call } from "@/lib/api";

export function UndoToast({
  notificationIds,
  message,
  onClose,
}: {
  notificationIds: string[];
  message: string;
  onClose: () => void;
}) {
  const [remaining, setRemaining] = useState(60);
  const [cancelled, setCancelled] = useState(false);

  useEffect(() => {
    if (cancelled) return;
    const t = setInterval(() => {
      setRemaining(r => {
        if (r <= 1) {
          clearInterval(t);
          onClose();
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [cancelled, onClose]);

  const doUndo = async () => {
    setCancelled(true);
    await Promise.all(
      notificationIds.map(id =>
        call("notifications:cancel", id).catch(() => {})
      )
    );
    setTimeout(onClose, 2000);
  };

  return (
    <div className="fixed bottom-4 right-4 bg-white border shadow-lg rounded p-4 w-80 z-50">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm">
          {cancelled ? "Notification cancelled." : `${message} (${remaining}s)`}
        </span>
        <div className="flex gap-2 shrink-0">
          {!cancelled && (
            <button
              type="button"
              className="text-blue-600 text-sm underline"
              onClick={doUndo}
            >
              Undo
            </button>
          )}
          <button
            type="button"
            className="text-gray-400 text-sm"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>
      </div>
      {!cancelled && (
        <div className="h-1 bg-gray-200 mt-2 rounded overflow-hidden">
          <div
            className="h-full bg-blue-600 transition-all duration-1000"
            style={{ width: `${(remaining / 60) * 100}%` }}
          />
        </div>
      )}
    </div>
  );
}
