import React from "react";

export interface OfflineQueueBadgeProps {
  readonly pendingCount: number;
  readonly isOffline?: boolean;
  readonly onToggleQueuePanel?: () => void;
}

export const OfflineQueueBadge: React.FC<OfflineQueueBadgeProps> = ({
  pendingCount,
  isOffline,
  onToggleQueuePanel,
}) => {
  if (pendingCount === 0 && !isOffline) return null;

  return (
    <button
      type="button"
      onClick={onToggleQueuePanel}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 transition-colors cursor-pointer"
      title="View queued offline attendance events"
    >
      <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
      <span>{pendingCount} Pending Sync{pendingCount === 1 ? "" : "s"}</span>
    </button>
  );
};
