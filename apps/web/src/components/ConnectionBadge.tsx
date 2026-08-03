import React from "react";
import { Radio, WifiOff, RefreshCw } from "lucide-react";
import { ConnectionStatus } from "../types/queue";

interface ConnectionBadgeProps {
  status: ConnectionStatus;
  onReconnect?: () => void;
}

export const ConnectionBadge: React.FC<ConnectionBadgeProps> = ({
  status,
  onReconnect,
}) => {
  const getStatusConfig = () => {
    switch (status) {
      case "connected":
        return {
          bg: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
          icon: <Radio className="h-3 w-3 text-emerald-500 animate-pulse" />,
          label: "Live Stream Connected",
        };
      case "connecting":
        return {
          bg: "bg-amber-500/10 text-amber-700 border-amber-500/20",
          icon: <Radio className="h-3 w-3 text-amber-500 animate-ping" />,
          label: "Connecting...",
        };
      case "error":
      case "disconnected":
      default:
        return {
          bg: "bg-rose-500/10 text-rose-700 border-rose-500/20",
          icon: <WifiOff className="h-3 w-3 text-rose-500" />,
          label: status === "error" ? "Connection Error" : "Disconnected",
        };
    }
  };

  const config = getStatusConfig();

  return (
    <div className="inline-flex items-center gap-2">
      <span
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${config.bg}`}
      >
        {config.icon}
        {config.label}
      </span>
      {status !== "connected" && onReconnect && (
        <button
          onClick={onReconnect}
          className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-semibold cursor-pointer focus:outline-none focus:underline"
        >
          <RefreshCw className="h-3 w-3" />
          Reconnect
        </button>
      )}
    </div>
  );
};
