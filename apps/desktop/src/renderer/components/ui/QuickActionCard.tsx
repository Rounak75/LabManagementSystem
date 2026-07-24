import { ReactNode } from "react";
import { ChevronRight } from "lucide-react";

interface QuickActionCardProps {
  icon: ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}

export function QuickActionCard({ icon, title, description, onClick }: QuickActionCardProps) {
  return (
    <button
      onClick={onClick}
      className="flex flex-1 items-center gap-4 rounded-card border border-slate-200 bg-white p-4 text-left shadow-card transition-all duration-200 hover:shadow-card-hover hover:border-slate-300 group min-w-[200px]"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-light text-brand">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-slate-900">{title}</div>
        <div className="text-xs font-medium text-slate-600">{description}</div>
      </div>
      <ChevronRight className="h-4 w-4 text-slate-400 transition-transform duration-200 group-hover:translate-x-0.5" />
    </button>
  );
}
