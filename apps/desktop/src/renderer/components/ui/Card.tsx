import { HTMLAttributes, ReactNode } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  noPadding?: boolean;
}

export function Card({ className = "", children, noPadding = false, ...rest }: CardProps) {
  return (
    <div 
      className={`rounded-card border border-slate-200 bg-white shadow-card ${noPadding ? "" : "p-6"} ${className}`} 
      {...rest}
    >
      {children}
    </div>
  );
}
