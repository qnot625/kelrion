import React, { useState } from "react";
import { useAttendance } from "../../hooks/useAttendance";
import { getSession, type KlerionSession } from "../../lib/session";
import { AttendanceStatusCard } from "./AttendanceStatusCard";
import { AttendanceTimer } from "./AttendanceTimer";
import { ClockControls } from "./ClockControls";
import { OfflineQueueBadge } from "./OfflineQueueBadge";
import { QueueHistoryPanel } from "./QueueHistoryPanel";
import { SyncStatusIndicator } from "./SyncStatusIndicator";

export interface ClockWidgetProps {
  readonly session?: KlerionSession | null;
  readonly employeeId?: string;
  readonly className?: string;
}

export const ClockWidget: React.FC<ClockWidgetProps> = ({ session, employeeId, className = "" }) => {
  const currentSession = session ?? getSession();
  const [isQueuePanelOpen, setIsQueuePanelOpen] = useState<boolean>(false);

  const {
    state,
    now,
    isLoading,
    isActionPending,
    isOffline,
    error,
    pendingQueueCount,
    queue,
    isSyncing,
    clockIn,
    clockOut,
    startBreak,
    endBreak,
    syncNow,
  } = useAttendance(currentSession, employeeId);

  return (
    <article className={`panel attendance-clock-widget ${className}`}>
      <header className="flex items-center justify-between pb-3">
        <div>
          <h2 className="text-base font-bold text-slate-900">Time & Attendance</h2>
          <p className="text-xs text-slate-500">Real-time clock controls and shift tracking</p>
        </div>
        <OfflineQueueBadge
          pendingCount={pendingQueueCount}
          isOffline={isOffline}
          onToggleQueuePanel={() => setIsQueuePanelOpen(!isQueuePanelOpen)}
        />
      </header>

      {error && (
        <div className="mb-3 p-2.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="py-8 text-center text-xs text-slate-400 italic">
          Loading attendance state...
        </div>
      ) : (
        <>
          <AttendanceStatusCard state={state} isOffline={isOffline} />
          <AttendanceTimer state={state} now={now} />
          <ClockControls
            status={state.status}
            isPending={isActionPending}
            onClockIn={clockIn}
            onClockOut={clockOut}
            onStartBreak={startBreak}
            onEndBreak={endBreak}
          />
          <QueueHistoryPanel
            queue={queue}
            isOpen={isQueuePanelOpen}
            onClose={() => setIsQueuePanelOpen(false)}
            onManualSync={syncNow}
            isSyncing={isSyncing}
          />
          <SyncStatusIndicator
            isSyncing={isSyncing}
            isOffline={isOffline}
            pendingCount={pendingQueueCount}
            onManualSync={syncNow}
          />
        </>
      )}
    </article>
  );
};
