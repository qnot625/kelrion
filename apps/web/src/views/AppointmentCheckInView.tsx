import React, { useEffect, useState, useCallback } from "react";
import { Calendar, Search, CheckCircle2, ArrowLeft, Loader2, Check } from "lucide-react";
import { Queue, Ticket, UserContext } from "../types/queue";
import { fetchQueues, checkInAppointment } from "../api/client";
import { TicketStatusBadge, PriorityBadge } from "../components/TicketBadge";
import { Alert } from "../components/Alert";

interface AppointmentCheckInViewProps {
  userContext: UserContext;
}

interface MockAppointment {
  id: string;
  code: string;
  customerName: string;
  customerPhone: string;
  scheduledTime: string;
  serviceName: string;
  status: "SCHEDULED" | "CHECKED_IN" | "CANCELLED";
}

export const AppointmentCheckInView: React.FC<AppointmentCheckInViewProps> = ({ userContext }) => {
  const [queues, setQueues] = useState<Queue[]>([]);
  const [selectedQueueId, setSelectedQueueId] = useState<string>("");
  const [searchCode, setSearchCode] = useState<string>("");
  const [foundAppointment, setFoundAppointment] = useState<MockAppointment | null>(null);

  const [convertedTicket, setConvertedTicket] = useState<Ticket | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mock pre-scheduled appointments database for search/demo
  const mockAppointments: MockAppointment[] = [
    {
      id: "apt_101",
      code: "APT-8821",
      customerName: "Dr. Sarah Connor",
      customerPhone: "+1 555-0188",
      scheduledTime: "10:30 AM Today",
      serviceName: "Specialist Consultation",
      status: "SCHEDULED",
    },
    {
      id: "apt_102",
      code: "APT-1042",
      customerName: "Michael Scott",
      customerPhone: "+1 555-0199",
      scheduledTime: "11:00 AM Today",
      serviceName: "Account Advisory",
      status: "SCHEDULED",
    },
    {
      id: "apt_103",
      code: "APT-9930",
      customerName: "Elena Rostova",
      customerPhone: "+1 555-0210",
      scheduledTime: "11:45 AM Today",
      serviceName: "Technical Service Review",
      status: "SCHEDULED",
    },
  ];

  const loadQueues = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const queueList = await fetchQueues(userContext);
      setQueues(queueList);
      if (queueList.length > 0 && !selectedQueueId) {
        setSelectedQueueId(queueList[0].id);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load appointment queues");
    } finally {
      setIsLoading(false);
    }
  }, [userContext, selectedQueueId]);

  useEffect(() => {
    loadQueues();
  }, [loadQueues]);

  const handleSearch = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);

    const query = searchCode.trim().toUpperCase();
    if (!query) {
      setError("Please enter an appointment code or phone number");
      return;
    }

    const match = mockAppointments.find(
      (a) => a.code.toUpperCase() === query || a.customerPhone.includes(query)
    );

    if (match) {
      setFoundAppointment(match);
      setConvertedTicket(null);
    } else {
      // Create an on-the-fly match for custom input
      setFoundAppointment({
        id: `apt_custom_${Date.now()}`,
        code: query,
        customerName: `Scheduled Guest (${query})`,
        customerPhone: "+1 555-0000",
        scheduledTime: "Now Scheduled",
        serviceName: "General Appointment",
        status: "SCHEDULED",
      });
      setConvertedTicket(null);
    }
  };

  const handleConvertAppointment = async () => {
    if (!foundAppointment || !selectedQueueId) return;

    try {
      setIsSubmitting(true);
      setError(null);

      const ticket = await checkInAppointment(
        selectedQueueId,
        {
          appointmentId: foundAppointment.code,
          customerName: foundAppointment.customerName,
          customerPhone: foundAppointment.customerPhone,
        },
        userContext
      );

      setConvertedTicket(ticket);
    } catch (err: any) {
      setError(err.message || "Failed to convert appointment to ticket");
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedQueue = queues.find((q) => q.id === selectedQueueId);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header Bar */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider">
            Appointment Check-In Console
          </span>
          <h1 className="text-2xl font-bold text-slate-900 mt-0.5">
            Convert Appointment to Ticket
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Check in pre-booked appointments into high-priority queue tickets automatically.
          </p>
        </div>

        <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center">
          <Calendar className="h-6 w-6" />
        </div>
      </div>

      {error && <Alert message={error} onDismiss={() => setError(null)} />}

      {!convertedTicket ? (
        <div className="space-y-6">
          {/* Search Bar */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
              Lookup Appointment Reference
            </h3>

            <form onSubmit={handleSearch} className="flex gap-2">
              <input
                type="text"
                placeholder="Enter Code (e.g. APT-8821) or Phone"
                value={searchCode}
                onChange={(e) => setSearchCode(e.target.value)}
                aria-label="Appointment Code or Phone"
                className="flex-1 p-3 text-sm border border-slate-300 rounded-xl font-medium text-slate-800 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                type="submit"
                aria-label="Search Appointment"
                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl transition shadow cursor-pointer flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <Search className="h-4 w-4" />
                <span>Search</span>
              </button>
            </form>

            {/* Quick Demo Shortcuts */}
            <div className="pt-2">
              <span className="text-xs text-slate-500 block mb-2 font-medium">
                Quick Demo Presets:
              </span>
              <div className="flex flex-wrap gap-2">
                {mockAppointments.map((apt) => (
                  <button
                    key={apt.id}
                    onClick={() => {
                      setSearchCode(apt.code);
                      setFoundAppointment(apt);
                      setConvertedTicket(null);
                    }}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {apt.code}: {apt.customerName}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Found Appointment Card */}
          {foundAppointment && (
            <div className="bg-white p-6 rounded-2xl border border-indigo-200 shadow-md space-y-6">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <span className="text-xs font-bold text-indigo-600">
                    Ref: {foundAppointment.code}
                  </span>
                  <h3 className="text-lg font-bold text-slate-900 mt-0.5">
                    {foundAppointment.customerName}
                  </h3>
                </div>
                <span className="px-3 py-1 bg-emerald-100 text-emerald-800 font-bold text-xs rounded-full inline-flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  Verified Booking
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm bg-slate-50 p-4 rounded-xl border border-slate-100">
                <div>
                  <span className="text-xs text-slate-400 block font-semibold">Service</span>
                  <strong className="text-slate-800">{foundAppointment.serviceName}</strong>
                </div>
                <div>
                  <span className="text-xs text-slate-400 block font-semibold">Scheduled Time</span>
                  <strong className="text-slate-800">{foundAppointment.scheduledTime}</strong>
                </div>
              </div>

              {/* Target Queue Selector */}
              <div>
                <label htmlFor="service-queue-select" className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Assign to Service Queue
                </label>
                {isLoading ? (
                  <div className="text-xs text-slate-400">Loading queues...</div>
                ) : (
                  <select
                    id="service-queue-select"
                    value={selectedQueueId}
                    onChange={(e) => setSelectedQueueId(e.target.value)}
                    className="w-full p-3 text-sm border border-slate-300 rounded-xl font-medium text-slate-800 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {queues.map((q) => (
                      <option key={q.id} value={q.id}>
                        [{q.code}] {q.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <button
                onClick={handleConvertAppointment}
                disabled={isSubmitting || !selectedQueueId}
                aria-label="Convert and Issue Priority Ticket"
                className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl transition shadow-md cursor-pointer flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Convert & Issue Priority Ticket
              </button>
            </div>
          )}
        </div>
      ) : (
        /* Converted Ticket Confirmation Card */
        <div className="bg-slate-900 text-white p-8 rounded-3xl shadow-2xl space-y-6">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <span className="text-xs font-extrabold uppercase text-emerald-400 tracking-wider flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Check-In Confirmed
              </span>
              <h3 className="text-lg font-bold text-slate-100 mt-0.5">
                {selectedQueue?.name || "Service Queue"}
              </h3>
            </div>
            <TicketStatusBadge status={convertedTicket.status} />
          </div>

          <div className="text-center py-6 bg-slate-950/80 rounded-2xl border border-slate-800">
            <span className="text-xs uppercase text-slate-400 font-semibold block mb-1">
              Issued Ticket Number
            </span>
            <div className="text-6xl font-black text-amber-400 tracking-tight">
              #{convertedTicket.number}
            </div>
            <div className="mt-2">
              <PriorityBadge priority={convertedTicket.priority} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-center text-xs">
            <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700">
              <span className="text-slate-400 block font-semibold">Appointment Ref</span>
              <strong className="text-slate-100 text-sm">{foundAppointment?.code}</strong>
            </div>

            <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700">
              <span className="text-slate-400 block font-semibold">Priority Ranking</span>
              <strong className="text-emerald-400 text-sm">HIGH (APPOINTMENT)</strong>
            </div>
          </div>

          <button
            onClick={() => {
              setConvertedTicket(null);
              setFoundAppointment(null);
              setSearchCode("");
            }}
            aria-label="Check in another appointment"
            className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl transition cursor-pointer flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-slate-500"
          >
            <ArrowLeft className="h-4 w-4" />
            Check In Another Appointment
          </button>
        </div>
      )}
    </div>
  );
};
