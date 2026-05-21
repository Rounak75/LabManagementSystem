import { useEffect, useState } from "react";

export function UpdateBanner() {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => window.api.onUpdateDownloaded((info) => setVersion(info.version)), []);

  if (!version) return null;
  return (
    <div className="mb-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
      <div className="font-medium">A new version ({version}) is ready.</div>
      <button
        onClick={() => window.api.invoke("updater:quitAndInstall")}
        className="mt-1 rounded bg-amber-600 px-2 py-1 text-white hover:bg-amber-700"
      >
        Restart to update
      </button>
    </div>
  );
}
