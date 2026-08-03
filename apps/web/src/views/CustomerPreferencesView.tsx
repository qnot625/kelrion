import React, { useState } from "react";
import { Bell, Smartphone, Mail, MessageSquare, CheckCircle2 } from "lucide-react";
import { UserContext } from "../types/queue";
import { Alert } from "../components/Alert";

interface CustomerPreferencesViewProps {
  userContext: UserContext;
}

export const CustomerPreferencesView: React.FC<CustomerPreferencesViewProps> = () => {
  const [phoneNumber, setPhoneNumber] = useState("+1 555-0199");
  const [email, setEmail] = useState("alex.morgan@example.com");
  const [enableSms, setEnableSms] = useState(true);
  const [enableWhatsApp, setEnableWhatsApp] = useState(true);
  const [enableEmail, setEnableEmail] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const handleSavePreferences = (e: React.FormEvent) => {
    e.preventDefault();
    setNotice("Notification alert preferences updated successfully.");
    setTimeout(() => setNotice(null), 3000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider bg-indigo-100 text-indigo-800 rounded">
              <Bell className="h-3 w-3" />
              Alert Subscriptions
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight mt-1">
            Notification Channel Preferences
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Configure how you receive queue position alerts, approach warnings, and counter call notifications.
          </p>
        </div>
      </div>

      {notice && <Alert type="success" message={notice} onDismiss={() => setNotice(null)} />}

      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm max-w-xl space-y-6">
        <form onSubmit={handleSavePreferences} className="space-y-5 text-xs">
          <div>
            <label className="block font-bold text-slate-800 mb-1 flex items-center gap-1.5">
              <Smartphone className="h-4 w-4 text-indigo-600" />
              Mobile Phone Number
            </label>
            <input
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-800 mb-1 flex items-center gap-1.5">
              <Mail className="h-4 w-4 text-indigo-600" />
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="border-t border-slate-100 pt-4 space-y-3">
            <span className="font-bold text-slate-800 block text-xs">Subscribed Channels</span>

            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100">
              <div className="flex items-center gap-2">
                <Smartphone className="h-4 w-4 text-slate-600" />
                <div>
                  <strong className="block text-slate-800">SMS Text Alerts</strong>
                  <span className="text-[10px] text-slate-500">Instant SMS when 2 customers remain</span>
                </div>
              </div>
              <input
                type="checkbox"
                checked={enableSms}
                onChange={(e) => setEnableSms(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-emerald-600" />
                <div>
                  <strong className="block text-slate-800">WhatsApp Instant Message</strong>
                  <span className="text-[10px] text-slate-500">Live ticket pass updates via WhatsApp</span>
                </div>
              </div>
              <input
                type="checkbox"
                checked={enableWhatsApp}
                onChange={(e) => setEnableWhatsApp(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-slate-600" />
                <div>
                  <strong className="block text-slate-800">Email Digest & Receipts</strong>
                  <span className="text-[10px] text-slate-500">Receive post-visit receipt logs</span>
                </div>
              </div>
              <input
                type="checkbox"
                checked={enableEmail}
                onChange={(e) => setEnableEmail(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow transition cursor-pointer flex items-center justify-center gap-2"
          >
            <CheckCircle2 className="h-4 w-4" /> Save Notification Preferences
          </button>
        </form>
      </div>
    </div>
  );
};
