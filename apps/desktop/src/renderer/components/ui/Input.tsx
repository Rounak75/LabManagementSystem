import { InputHTMLAttributes, forwardRef } from "react";
interface Props extends InputHTMLAttributes<HTMLInputElement> { label?: string; error?: string; }
export const Input = forwardRef<HTMLInputElement, Props>(({ label, error, className = "", ...rest }, ref) => (
  <label className="block w-full">
    {label && <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-700">{label}</span>}
    <input 
      ref={ref} 
      className={`w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 transition-colors duration-200 placeholder:text-slate-400 hover:border-slate-300 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 ${error ? "border-danger focus:border-danger focus:ring-danger/20" : ""} ${className}`} 
      {...rest} 
    />
    {error && <span className="mt-1 block text-xs text-danger">{error}</span>}
  </label>
));
Input.displayName = "Input";
