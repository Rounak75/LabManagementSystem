import { ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";
interface Props extends ButtonHTMLAttributes<HTMLButtonElement> { variant?: Variant; }

const styles: Record<Variant, string> = {
  primary:   "bg-brand text-white hover:bg-brand-dark",
  secondary: "bg-slate-200 text-slate-900 hover:bg-slate-300",
  danger:    "bg-danger text-white hover:opacity-90",
  ghost:     "bg-transparent text-slate-700 hover:bg-slate-100"
};

export const Button = forwardRef<HTMLButtonElement, Props>(
  ({ variant = "primary", className = "", ...rest }, ref) => (
    <button
      ref={ref}
      className={`inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50 ${styles[variant]} ${className}`}
      {...rest}
    />
  )
);
Button.displayName = "Button";
