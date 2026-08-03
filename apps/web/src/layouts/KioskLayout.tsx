import React from "react";
import { UserContext } from "../types/queue";
import { WalkInKioskView } from "../views/WalkInKioskView";

interface KioskLayoutProps {
  userContext: UserContext;
}

export const KioskLayout: React.FC<KioskLayoutProps> = ({ userContext }) => {
  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-4 sm:p-8 flex flex-col items-center justify-center">
      {/* Self-Service Touchscreen Kiosk - Exposes only walk-in ticket creation & receipt printing */}
      <div className="w-full max-w-3xl">
        <WalkInKioskView userContext={userContext} />
      </div>
    </div>
  );
};
