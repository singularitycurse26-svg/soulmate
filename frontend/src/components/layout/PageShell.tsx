import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  icon?: LucideIcon;
  title: string;
  subtitle?: string;
  accent?: string;
  actions?: React.ReactNode;
}

export function PageHeader({ icon: Icon, title, subtitle, accent = "from-accent to-purple-400", actions }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div className="flex items-center gap-3 min-w-0">
        {Icon && (
          <div className={cn("w-11 h-11 rounded-2xl bg-gradient-to-br flex items-center justify-center shrink-0 shadow-lg shadow-accent/10", accent)}>
            <Icon className="w-5 h-5 text-white" />
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-semibold tracking-tight truncate">{title}</h1>
          {subtitle && <p className="text-sm text-muted mt-0.5 truncate">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

interface PageShellProps {
  children: React.ReactNode;
  className?: string;
  flush?: boolean;
}

export function PageShell({ children, className, flush }: PageShellProps) {
  return (
    <div className={cn("animate-fade-in", flush ? "" : "space-y-6", className)}>
      {children}
    </div>
  );
}

interface StatCardProps {
  icon?: LucideIcon;
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: "default" | "success" | "warning" | "danger" | "accent";
}

const TONE = {
  default: "text-white",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  accent: "text-accent",
};

export function StatCard({ icon: Icon, label, value, hint, tone = "default" }: StatCardProps) {
  return (
    <div className="card-soft">
      <div className="flex items-center gap-2 mb-2">
        {Icon && <Icon className="w-4 h-4 text-accent" />}
        <span className="text-sm font-medium text-muted">{label}</span>
      </div>
      <p className={cn("text-xl font-semibold tracking-tight", TONE[tone])}>{value}</p>
      {hint && <p className="text-xs text-muted mt-1">{hint}</p>}
    </div>
  );
}
