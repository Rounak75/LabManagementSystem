import { ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";
type Size = "sm" | "md";
interface Props extends ButtonHTMLAttributes<HTMLButtonElement> { variant?: Variant; size?: Size; }

const styles: Record<Variant, string> = {
  primary:   "bg-brand text-white hover:bg-brand-dark",
  secondary: "bg-slate-200 text-slate-900 hover:bg-slate-300",
  danger:    "bg-danger text-white hover:opacity-90",
  ghost:     "bg-transparent text-slate-700 hover:bg-slate-100"
};

const sizes: Record<Size, string> = {
  sm: "px-2.5 py-1 text-xs",
  md: "px-4 py-2 text-sm"
};

export const Button = forwardRef<HTMLButtonElement, Props>(
  ({ variant = "primary", size = "md", className = "", ...rest }, ref) => (
    <button
      ref={ref}
      className={`inline-flex items-center justify-center rounded-md font-medium disabled:opacity-50 ${sizes[size]} ${styles[variant]} ${className}`}
      {...rest}
    />
  )
);
Button.displayName = "Button";
