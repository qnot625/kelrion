import { useState, useEffect } from "react";
import { klerionApi, type ApiService, type ApiBranch } from "../../lib/api";
import type { KlerionSession } from "../../lib/session";
import { Calendar, Clock, MapPin, User, Mail } from "lucide-react";

interface BookingFormProps {
  session: KlerionSession;
  onSuccess?: () => void;
}

export function BookingForm({ session, onSuccess }: BookingFormProps) {
  const [services, setServices] = useState<ApiService[]>([]);
  const [branches, setBranches] = useState<ApiBranch[]>([]);
  
  const [selectedServiceId, setSelectedServiceId] = useState<string>("");
  const [selectedBranchId, setSelectedBranchId] = useState<string>("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [loadedServices, loadedBranches] = await Promise.all([
          klerionApi.listServices(session),
          klerionApi.listBranches(session),
        ]);
        setServices(loadedServices.filter(s => s.status === "active"));
        setBranches(loadedBranches.filter(b => b.status === "active"));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load data");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [session]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedServiceId || !selectedBranchId || !customerEmail || !date || !time) {
      setError("Please fill in all fields.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const service = services.find(s => s.id === selectedServiceId);
      if (!service) throw new Error("Invalid service");

      // Construct startAt and endAt based on duration
      const startAt = new Date(`${date}T${time}:00Z`);
      if (Number.isNaN(startAt.getTime())) {
        throw new Error("Invalid date or time");
      }
      const endAt = new Date(startAt.getTime() + service.durationMinutes * 60000);

      await klerionApi.bookAppointment(session, {
        branchId: selectedBranchId,
        serviceId: selectedServiceId,
        customerEmail,
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
      });
      if (onSuccess) onSuccess();
      
      // Reset form on success if no onSuccess provided
      setSelectedServiceId("");
      setSelectedBranchId("");
      setCustomerEmail("");
      setDate("");
      setTime("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Booking failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="p-4 text-gray-500">Loading form...</div>;
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6 max-w-lg mx-auto shadow-sm">
      <h2 className="text-xl font-medium text-gray-900 mb-6">Book an Appointment</h2>
      
      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded border border-red-200">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Service</label>
          <select 
            value={selectedServiceId} 
            onChange={(e) => setSelectedServiceId(e.target.value)}
            className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
            disabled={submitting}
          >
            <option value="">Select a service</option>
            {services.map(s => (
              <option key={s.id} value={s.id}>{s.name} ({s.durationMinutes} min)</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Branch</label>
          <select 
            value={selectedBranchId} 
            onChange={(e) => setSelectedBranchId(e.target.value)}
            className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
            disabled={submitting}
          >
            <option value="">Select a branch</option>
            {branches.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
          <input 
            type="date" 
            value={date} 
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
            disabled={submitting}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Time (UTC)</label>
          <input 
            type="time" 
            value={time} 
            onChange={(e) => setTime(e.target.value)}
            className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
            disabled={submitting}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Customer Email</label>
          <input 
            type="email" 
            value={customerEmail} 
            onChange={(e) => setCustomerEmail(e.target.value)}
            placeholder="customer@example.com"
            className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
            disabled={submitting}
          />
        </div>

        <button 
          type="submit" 
          disabled={submitting}
          className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
        >
          {submitting ? "Booking..." : "Book Appointment"}
        </button>
      </form>
    </div>
  );
}
