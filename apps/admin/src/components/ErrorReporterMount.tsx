"use client";
import { useEffect } from "react";
import { installErrorReporter } from "@/lib/client-error-reporter";

export function ErrorReporterMount() {
  useEffect(() => {
    installErrorReporter();
  }, []);
  return null;
}
