import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from "lucide-react";

const icons = {
  success: CheckCircle,
  danger: AlertCircle,
  info: Info,
  warning: AlertTriangle,
};

const styles = {
  success: "bg-success/10 border-success text-success",
  danger: "bg-danger/10 border-danger text-danger",
  info: "bg-accent/10 border-accent text-accent",
  warning: "bg-warning/10 border-warning text-warning",
};

export function AlertContainer() {
  const { alerts, dismissAlert } = useStore();

  if (alerts.length === 0) return null;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 w-full max-w-sm px-4">
      {alerts.map((alert) => {
        const Icon = icons[alert.type];
        return (
          <div
            key={alert.id}
            className={cn(
              "flex items-start gap-3 p-3 rounded-lg border animate-slide-down",
              styles[alert.type]
            )}
          >
            <Icon className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <p className="text-sm flex-1">{alert.message}</p>
            <button
              onClick={() => dismissAlert(alert.id)}
              className="text-muted hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
