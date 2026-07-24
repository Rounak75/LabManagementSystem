import { ReactNode } from "react";
import { Card } from "./Card";

interface StatCardProps {
  icon: ReactNode;
  value: number | string;
  label: string;
  trend?: { value: string; direction: "up" | "down" | "neutral" };
  isLoading?: boolean;
}

export function StatCard({ icon, value, label, trend, isLoading }: StatCardProps) {
  if (isLoading) {
    return (
      <Card className="flex-1 min-w-[200px] animate-pulse">
        <div className="flex items-start gap-4">
          <div className="h-10 w-10 rounded-lg bg-slate-100" />
          <div className="flex-1">
            <div className="h-7 w-16 rounded bg-slate-100" />
            <div className="mt-2 h-4 w-24 rounded bg-slate-50" />
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="flex-1 min-w-[200px]">
      <div className="flex items-start gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-2xl font-semibold text-slate-900">{value}</div>
          <div className="mt-0.5 text-sm font-medium text-slate-600">{label}</div>
        </div>
      </div>
      {trend && (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <span className={`text-xs font-medium ${
            trend.direction === "up" ? "text-status-success" :
            trend.direction === "down" ? "text-status-error" :
            "text-slate-400"
          }`}>
            {trend.direction === "up" && "↑ "}
            {trend.direction === "down" && "↓ "}
            {trend.direction === "neutral" && "— "}
            {trend.value}
          </span>
        </div>
      )}
    </Card>
  );
}
