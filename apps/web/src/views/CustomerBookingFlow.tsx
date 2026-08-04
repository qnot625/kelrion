import { CustomerBookingWizard } from "../features/appointments/CustomerBookingWizard";
import { Sparkles, ArrowLeft } from "lucide-react";

interface CustomerBookingFlowProps {
  readonly onBackToLogin?: () => void;
}

export function CustomerBookingFlow({ onBackToLogin }: CustomerBookingFlowProps) {
  return (
    <main className="min-h-screen bg-gray-50 flex flex-col" id="public-booking-flow-page">
      {/* Visual Header */}
      <header className="bg-white border-b border-gray-200 py-4 px-6 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 text-white font-black text-xl px-3 py-1.5 rounded-lg flex items-center gap-1.5 tracking-tight shadow-sm select-none">
            <span className="font-mono bg-indigo-500 text-white text-xs px-1 rounded">K</span>
            klerion
          </div>
          <span className="h-5 w-px bg-gray-200 hidden sm:inline" />
          <span className="text-sm font-medium text-gray-500 hidden sm:inline flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-indigo-500" /> Public Appointment Hub
          </span>
        </div>

        {onBackToLogin && (
          <button
            type="button"
            id="back-to-login-header-btn"
            onClick={onBackToLogin}
            className="flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-indigo-600 border border-gray-200 rounded-lg px-3 py-2 bg-white hover:bg-gray-50 transition-all cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" /> Member Login
          </button>
        )}
      </header>

      {/* Main Content Area */}
      <section className="flex-1 py-10 px-4 md:px-8 max-w-4xl mx-auto w-full flex flex-col justify-center">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            Schedule an Appointment
          </h1>
          <p className="mt-2 text-base text-gray-500 max-w-md mx-auto">
            Book service sessions directly with your preferred local department branch.
          </p>
        </div>

        <CustomerBookingWizard onBackToLogin={onBackToLogin} />
      </section>

      {/* Visual Footer */}
      <footer className="py-6 border-t border-gray-200 text-center text-xs text-gray-400">
        Powered by Klerion. Securely isolated and tenant-ready.
      </footer>
    </main>
  );
}
