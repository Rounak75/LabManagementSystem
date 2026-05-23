import { InputHTMLAttributes, forwardRef } from "react";
interface Props extends InputHTMLAttributes<HTMLInputElement> { label?: string; error?: string; }
export const Input = forwardRef<HTMLInputElement, Props>(({ label, error, className = "", ...rest }, ref) => (
  <label className="block">
    {label && <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>}
    <input ref={ref} className={`w-full rounded-md border border-slate-300 px-3 py-2 text-sm transition-shadow focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30 ${error ? "border-danger" : ""} ${className}`} {...rest} />
    {error && <span className="mt-1 block text-xs text-danger">{error}</span>}
  </label>
));
Input.displayName = "Input";
