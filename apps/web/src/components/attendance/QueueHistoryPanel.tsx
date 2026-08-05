import React from "react";
import { QueuedAttendanceItem } from "../../lib/attendance-queue";

export interface QueueHistoryPanelProps {
  readonly queue: readonly QueuedAttendanceItem[];
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onManualSync?: () => void;
  readonly isSyncing?: boolean;
}

export const QueueHistoryPanel: React.FC<QueueHistoryPanelProps> = ({
  queue,
  isOpen,
  onClose,
  onManualSync,
  isSyncing,
}) => {
  if (!isOpen) return null;

  return (
    <div className="mt-3 p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-2">
      <div className="flex items-center justify-between pb-1 border-b border-slate-200 font-semibold text-slate-700">
        <span>Offline Queue Details ({queue.length} item{queue.length === 1 ? "" : "s"})</span>
        <div className="flex items-center gap-2">
          {onManualSync && (
            <button
              type="button"
              disabled={isSyncing || queue.length === 0}
              onClick={onManualSync}
              className="px-2 py-0.5 bg-sky-600 text-white rounded hover:bg-sky-700 disabled:opacity-50"
            >
              {isSyncing ? "Syncing..." : "Replay Queue"}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 font-bold"
          >
            ×
          </button>
        </div>
      </div>

      {queue.length === 0 ? (
        <p className="text-slate-500 italic py-2">No pending offline events.</p>
      ) : (
        <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
          {queue.map((item) => (
            <div
              key={item.id}
              className="p-2 bg-white rounded border border-slate-200 flex items-center justify-between"
            >
              <div>
                <span className="font-semibold text-slate-800 uppercase tracking-wider">
                  {item.eventType.replace("_", " ")}
                </span>
                <span className="text-slate-500 ml-2">
                  {new Date(item.timestamp).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </span>
              </div>
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-medium uppercase ${
                  item.status === "pending"
                    ? "bg-amber-100 text-amber-700"
                    : item.status === "failed"
                    ? "bg-rose-100 text-rose-700"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                {item.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
