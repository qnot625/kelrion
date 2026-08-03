import React from "react";
import { UserContext } from "../types/queue";
import { QueueDisplayBoardView } from "../views/QueueDisplayBoardView";

interface DisplayLayoutProps {
  userContext: UserContext;
  initialQueueId?: string;
}

export const DisplayLayout: React.FC<DisplayLayoutProps> = ({
  userContext,
  initialQueueId,
}) => {
  return (
    <div className="min-h-screen bg-slate-950 text-white p-2 sm:p-6 flex flex-col justify-between">
      {/* Lobby TV Display Container - No administrative sidebars, settings or staff controls */}
      <div className="w-full max-w-7xl mx-auto flex-1 flex flex-col">
        <QueueDisplayBoardView
          userContext={userContext}
          initialQueueId={initialQueueId}
        />
      </div>
    </div>
  );
};
