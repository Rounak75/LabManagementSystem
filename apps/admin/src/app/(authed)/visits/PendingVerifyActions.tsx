"use client";
import { useState } from "react";
import { BatchVerifyDialog, type BatchCandidate } from "../dashboard/BatchVerifyDialog";

export function PendingVerifyActions({ candidates }: { candidates: BatchCandidate[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        disabled={candidates.length === 0}
        className="btn-success"
      >
        Verify low-risk visits in bulk
        {candidates.length > 0 ? ` (${candidates.length})` : ""}
      </button>
      {open && <BatchVerifyDialog candidates={candidates} onClose={() => setOpen(false)} />}
    </>
  );
}
