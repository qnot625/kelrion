import React from "react";

export interface SyncStatusIndicatorProps {
  readonly isSyncing: boolean;
  readonly isOffline?: boolean;
  readonly pendingCount: number;
  readonly onManualSync?: () => void;
}

export const SyncStatusIndicator: React.FC<SyncStatusIndicatorProps> = ({
  isSyncing,
  isOffline,
  pendingCount,
  onManualSync,
}) => {
  return (
    <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
      <div className="flex items-center gap-1.5">
        <span
          className={`w-2 h-2 rounded-full ${
            isOffline ? "bg-amber-400" : isSyncing ? "bg-sky-500 animate-ping" : "bg-emerald-500"
          }`}
        />
        <span>
          {isOffline
            ? "Offline Queue Active"
            : isSyncing
            ? "Syncing Events..."
            : "Cloud Sync Ready"}
        </span>
      </div>

      {pendingCount > 0 && !isOffline && (
        <button
          type="button"
          disabled={isSyncing}
          onClick={onManualSync}
          className="text-xs font-semibold text-sky-600 hover:text-sky-700 disabled:opacity-50"
        >
          {isSyncing ? "Syncing..." : "Sync Now"}
        </button>
      )}
    </div>
  );
};
