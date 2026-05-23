import { SelectHTMLAttributes, forwardRef } from "react";
interface Props extends SelectHTMLAttributes<HTMLSelectElement> { label?: string; error?: string; }
export const Select = forwardRef<HTMLSelectElement, Props>(({ label, error, className = "", children, ...rest }, ref) => (
  <label className="block">
    {label && <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>}
    <select ref={ref} className={`w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm transition-shadow focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30 ${error ? "border-danger" : ""} ${className}`} {...rest}>
      {children}
    </select>
    {error && <span className="mt-1 block text-xs text-danger">{error}</span>}
  </label>
));
Select.displayName = "Select";
