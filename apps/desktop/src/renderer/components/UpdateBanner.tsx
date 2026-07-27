import { useEffect, useState } from "react";

type Stage = "idle" | "available" | "downloading" | "ready";

export function UpdateBanner() {
  const [version, setVersion] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>("idle");

  useEffect(() => window.api.onUpdateAvailable((info) => {
    setVersion(info.version);
    setStage("available");
  }), []);

  // Arrives only after the operator agreed to the download — or, on a build that
  // still auto-downloads, on its own. Either way "ready" is the right stage.
  useEffect(() => window.api.onUpdateDownloaded((info) => {
    setVersion(info.version);
    setStage("ready");
  }), []);

  if (stage === "idle" || !version) return null;

  return (
    <div className="mb-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
      {stage === "available" && (
        <>
          <div className="font-medium">Version {version} is available.</div>
          <button
            onClick={() => {
              setStage("downloading");
              void window.api.invoke("updater:download");
            }}
            className="mt-1 rounded bg-amber-600 px-2 py-1 text-white hover:bg-amber-700"
          >
            Download
          </button>
        </>
      )}

      {stage === "downloading" && (
        <div className="font-medium">Downloading version {version}…</div>
      )}

      {stage === "ready" && (
        <>
          <div className="font-medium">Version {version} is ready to install.</div>
          <button
            onClick={() => window.api.invoke("updater:quitAndInstall")}
            className="mt-1 rounded bg-amber-600 px-2 py-1 text-white hover:bg-amber-700"
          >
            Restart to update
          </button>
        </>
      )}
    </div>
  );
}
