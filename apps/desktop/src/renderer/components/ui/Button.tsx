import { ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";
type Size = "sm" | "md";
interface Props extends ButtonHTMLAttributes<HTMLButtonElement> { 
  variant?: Variant; 
  size?: Size;
}

const styles: Record<Variant, string> = {
  primary:   "bg-brand text-white hover:bg-brand-dark",
  secondary: "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50",
  danger:    "bg-danger text-white hover:bg-red-700",
  ghost:     "bg-transparent text-slate-600 hover:bg-slate-100"
};

const sizes: Record<Size, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2 text-sm"
};

export const Button = forwardRef<HTMLButtonElement, Props>(
  ({ variant = "primary", size = "md", className = "", children, ...rest }, ref) => {
    return (
      <button
        ref={ref}
        className={`inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ${sizes[size]} ${styles[variant]} ${className}`}
        {...rest}
      >
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";
