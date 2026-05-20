"use client";
import { useState } from "react";

export default function DisputePage() {
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    try {
      await fetch("/api/disputes", { method: "POST" });
      setSubmitted(true);
    } finally { setSubmitting(false); }
  }

  if (submitted) return (
    <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded">
      <h2 className="font-semibold">We've received your report.</h2>
      <p className="text-sm mt-2">
        Our staff will call you within 24 hours to verify your identity. After verification,
        this phone number will be disconnected from the patient account.
      </p>
    </div>
  );

  return (
    <div className="mt-6 max-w-lg">
      <h1 className="text-xl font-semibold mb-2">This isn't me</h1>
      <p className="text-sm text-gray-700 mb-4">
        If you are not the patient associated with this phone number (for example, you recently
        received this number and someone else used it before), please let us know. Our staff will
        call to verify and then disconnect this phone from the patient account.
      </p>
      <button
        onClick={handleSubmit}
        disabled={submitting}
        className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded font-medium disabled:opacity-50"
      >
        {submitting ? "Submitting…" : "Report this to the lab"}
      </button>
    </div>
  );
}
