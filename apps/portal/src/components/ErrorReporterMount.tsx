"use client";

import { useEffect } from "react";
import { installErrorReporter } from "@portal/lib/client-error-reporter";

export function ErrorReporterMount() {
  useEffect(() => {
    installErrorReporter();
  }, []);
  return null;
}
