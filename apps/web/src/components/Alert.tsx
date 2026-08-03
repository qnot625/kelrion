import React from "react";
import { AlertCircle, CheckCircle2, Info, AlertTriangle, X, RefreshCw } from "lucide-react";

interface AlertProps {
  type?: "error" | "info" | "success" | "warning";
  title?: string;
  message: string;
  onDismiss?: () => void;
  onRetry?: () => void;
}

export const Alert: React.FC<AlertProps> = ({
  type = "error",
  title,
  message,
  onDismiss,
  onRetry,
}) => {
  const getStyles = () => {
    switch (type) {
      case "success":
        return "bg-emerald-50 text-emerald-900 border-emerald-200";
      case "warning":
        return "bg-amber-50 text-amber-900 border-amber-200";
      case "info":
        return "bg-blue-50 text-blue-900 border-blue-200";
      case "error":
      default:
        return "bg-rose-50 text-rose-900 border-rose-200";
    }
  };

  const renderIcon = () => {
    switch (type) {
      case "success":
        return <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />;
      case "warning":
        return <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />;
      case "info":
        return <Info className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />;
      case "error":
      default:
        return <AlertCircle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />;
    }
  };

  return (
    <div
      role="alert"
      className={`p-4 rounded-xl border text-sm flex items-start justify-between gap-3 shadow-sm ${getStyles()}`}
    >
      <div className="flex items-start gap-3">
        {renderIcon()}
        <div>
          {title && <h4 className="font-semibold mb-0.5">{title}</h4>}
          <p className="text-xs sm:text-sm leading-relaxed">{message}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {onRetry && (
          <button
            onClick={onRetry}
            className="inline-flex items-center gap-1 text-xs font-semibold hover:opacity-80 cursor-pointer focus:outline-none focus:ring-1 focus:ring-current rounded px-1.5 py-0.5"
          >
            <RefreshCw className="h-3 w-3" />
            Retry
          </button>
        )}
        {onDismiss && (
          <button
            onClick={onDismiss}
            aria-label="Dismiss alert"
            className="p-1 text-xs font-semibold opacity-60 hover:opacity-100 rounded cursor-pointer focus:outline-none focus:ring-1 focus:ring-current"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
};
