type Variant = "success" | "processing" | "pending" | "error" | "neutral";

const variants: Record<Variant, { dot: string; bg: string; text: string }> = {
  success:    { dot: "bg-status-success",    bg: "bg-status-success-light", text: "text-status-success" },
  processing: { dot: "bg-status-processing", bg: "bg-status-processing-light", text: "text-status-processing" },
  pending:    { dot: "bg-status-pending",    bg: "bg-status-pending-light", text: "text-status-pending" },
  error:      { dot: "bg-status-error",      bg: "bg-status-error-light", text: "text-status-error" },
  neutral:    { dot: "bg-slate-400",         bg: "bg-slate-100", text: "text-slate-600" },
};

export function StatusBadge({ children, variant = "neutral" }: { children: string; variant?: Variant }) {
  const v = variants[variant];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${v.bg} ${v.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${v.dot}`} />
      {children}
    </span>
  );
}
