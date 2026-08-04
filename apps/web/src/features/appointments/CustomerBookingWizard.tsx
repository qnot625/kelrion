import { useState, useEffect } from "react";
import { klerionApi, type ApiService, type ApiBranch, type ApiAppointment } from "../../lib/api";
import {
  Calendar as CalendarIcon,
  Clock as ClockIcon,
  MapPin as MapPinIcon,
  User as UserIcon,
  Mail as MailIcon,
  Phone as PhoneIcon,
  ArrowRight,
  ArrowLeft,
  CheckCircle,
  AlertCircle,
  Building,
  Briefcase,
  Loader2,
  RefreshCw
} from "lucide-react";

interface CustomerBookingWizardProps {
  readonly initialTenantSlug?: string;
  readonly onBackToLogin?: () => void;
}

const DEFAULT_TIME_SLOTS = [
  "08:00", "08:30", "09:00", "09:30", "10:00", "10:30", "11:00", "11:30",
  "12:00", "12:30", "13:00", "13:30", "14:00", "14:30", "15:00", "15:30",
  "16:00", "16:30"
];

export function CustomerBookingWizard({ initialTenantSlug = "", onBackToLogin }: CustomerBookingWizardProps) {
  // Tenant selection state
  const [tenantSlug, setTenantSlug] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("tenant") || params.get("tenantSlug") || initialTenantSlug || "acme-clinics";
  });
  const [isTenantConfirmed, setIsTenantConfirmed] = useState(true);

  // Wizard steps: 1 = Branch, 2 = Service, 3 = Date & Time, 4 = Customer Details, 5 = Confirmation
  const [step, setStep] = useState(1);

  // Selections
  const [selectedBranch, setSelectedBranch] = useState<ApiBranch | null>(null);
  const [selectedService, setSelectedService] = useState<ApiService | null>(null);
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  
  // Customer details
  const [fullName, setFullName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [phone, setPhone] = useState("");

  // Data fetching states
  const [branches, setBranches] = useState<ApiBranch[]>([]);
  const [services, setServices] = useState<ApiService[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [loadingServices, setLoadingServices] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Feedback states
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [createdAppointment, setCreatedAppointment] = useState<ApiAppointment | null>(null);
  const [bookingStatus, setBookingStatus] = useState<"idle" | "success" | "error">("idle");

  // Fetch branches on tenantSlug confirmation
  useEffect(() => {
    if (!tenantSlug || !isTenantConfirmed) return;

    async function loadBranches() {
      setLoadingBranches(true);
      setError(null);
      try {
        const discovered = await klerionApi.discoverBranches({ tenantSlug });
        // Map discovered branches to ApiBranch structure
        const mappedBranches: ApiBranch[] = discovered.map(b => ({
          id: b.branchId,
          tenantId: b.tenantId,
          name: b.branchName,
          slug: b.branchName.toLowerCase().replace(/[^a-z0-9-]/g, ""),
          address: b.address,
          latitude: b.latitude,
          longitude: b.longitude,
          status: b.status,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }));
        setBranches(mappedBranches.filter(b => b.status === "active"));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load branches for the specified organization.");
      } finally {
        setLoadingBranches(false);
      }
    }

    void loadBranches();
  }, [tenantSlug, isTenantConfirmed]);

  // Fetch services when branch is selected
  useEffect(() => {
    if (!selectedBranch) {
      setServices([]);
      return;
    }

    async function loadServices() {
      setLoadingServices(true);
      setError(null);
      try {
        const branchServices = await klerionApi.getPublicBranchServices(tenantSlug, selectedBranch.id);
        setServices(branchServices.filter(s => s.status === "active"));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load services for this branch.");
      } finally {
        setLoadingServices(false);
      }
    }

    void loadServices();
  }, [selectedBranch, tenantSlug]);

  // Validate Step 4 inputs
  const validateDetails = () => {
    const errors: Record<string, string> = {};
    if (!fullName.trim()) {
      errors.fullName = "Full name is required.";
    }
    
    if (!customerEmail.trim()) {
      errors.email = "Email address is required.";
    } else {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(customerEmail)) {
        errors.email = "Please enter a valid email address.";
      }
    }

    if (!phone.trim()) {
      errors.phone = "Phone number is required.";
    } else {
      const phoneRegex = /^[+]?[0-9\s-]{7,15}$/;
      if (!phoneRegex.test(phone)) {
        errors.phone = "Please enter a valid phone number (e.g. +1234567890).";
      }
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleNextStep = () => {
    setError(null);
    if (step === 1) {
      if (!selectedBranch) {
        setError("Please select a branch to proceed.");
        return;
      }
      setStep(2);
    } else if (step === 2) {
      if (!selectedService) {
        setError("Please select a service to proceed.");
        return;
      }
      setStep(3);
    } else if (step === 3) {
      if (!selectedDate || !selectedTime) {
        setError("Please select both a date and time slot.");
        return;
      }
      setStep(4);
    } else if (step === 4) {
      if (validateDetails()) {
        setStep(5);
      }
    }
  };

  const handleBackStep = () => {
    setError(null);
    setStep(prev => Math.max(1, prev - 1));
  };

  const handleConfirmBooking = async () => {
    if (!selectedBranch || !selectedService || !selectedDate || !selectedTime) {
      setError("Incomplete booking selection.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const startAt = new Date(`${selectedDate}T${selectedTime}:00Z`);
      if (Number.isNaN(startAt.getTime())) {
        throw new Error("Invalid booking date or time selected.");
      }
      const endAt = new Date(startAt.getTime() + selectedService.durationMinutes * 60000);

      const appointment = await klerionApi.bookPublicAppointment(tenantSlug, {
        branchId: selectedBranch.id,
        serviceId: selectedService.id,
        customerEmail,
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        customerMetadata: {
          fullName,
          phone
        }
      });

      setCreatedAppointment(appointment);
      setBookingStatus("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred during booking.");
      setBookingStatus("error");
    } finally {
      setSubmitting(false);
    }
  };

  const resetWizard = () => {
    setStep(1);
    setSelectedBranch(null);
    setSelectedService(null);
    setSelectedDate("");
    setSelectedTime("");
    setFullName("");
    setCustomerEmail("");
    setPhone("");
    setCreatedAppointment(null);
    setBookingStatus("idle");
    setError(null);
    setFieldErrors({});
  };

  // Step 1 Render: Branch Selection
  const renderBranchStep = () => {
    if (loadingBranches) {
      return (
        <div className="flex flex-col items-center justify-center py-12" id="loading-branches">
          <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mb-3" />
          <p className="text-sm text-gray-500">Searching active branches...</p>
        </div>
      );
    }

    return (
      <div className="space-y-4" id="step-branch-selection">
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-lg font-medium text-gray-900">Select Branch</h3>
          <button
            type="button"
            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
            onClick={() => setIsTenantConfirmed(false)}
            id="change-tenant-button"
          >
            Change organization
          </button>
        </div>

        {branches.length === 0 ? (
          <div className="p-6 text-center border border-dashed border-gray-200 rounded-lg" id="no-branches-alert">
            <Building className="w-12 h-12 text-gray-300 mx-auto mb-2" />
            <p className="text-sm font-medium text-gray-700">No active branches found</p>
            <p className="text-xs text-gray-400 mt-1">Please double check the organization slug.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2" id="branch-cards-grid">
            {branches.map(b => (
              <button
                key={b.id}
                type="button"
                id={`branch-card-${b.id}`}
                onClick={() => setSelectedBranch(b)}
                className={`flex flex-col text-left p-4 rounded-xl border transition-all cursor-pointer min-h-[100px] outline-none ${
                  selectedBranch?.id === b.id
                    ? "border-indigo-600 bg-indigo-50/40 ring-2 ring-indigo-600/10"
                    : "border-gray-200 hover:border-gray-300 bg-white"
                }`}
              >
                <span className="font-semibold text-gray-900 text-base">{b.name}</span>
                <span className="text-sm text-gray-500 mt-1 flex items-start gap-1">
                  <MapPinIcon className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
                  {b.address || "No address listed"}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  // Step 2 Render: Service Selection
  const renderServiceStep = () => {
    if (loadingServices) {
      return (
        <div className="flex flex-col items-center justify-center py-12" id="loading-services">
          <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mb-3" />
          <p className="text-sm text-gray-500">Retrieving available services...</p>
        </div>
      );
    }

    return (
      <div className="space-y-4" id="step-service-selection">
        <div className="mb-2">
          <h3 className="text-lg font-medium text-gray-900">Select Service</h3>
          <p className="text-sm text-gray-500">Offered at <span className="font-medium text-gray-800">{selectedBranch?.name}</span></p>
        </div>

        {services.length === 0 ? (
          <div className="p-6 text-center border border-dashed border-gray-200 rounded-lg" id="no-services-alert">
            <Briefcase className="w-12 h-12 text-gray-300 mx-auto mb-2" />
            <p className="text-sm font-medium text-gray-700">No services available</p>
            <p className="text-xs text-gray-400 mt-1">This location currently does not offer any services.</p>
          </div>
        ) : (
          <div className="space-y-3" id="service-cards-list">
            {services.map(s => (
              <button
                key={s.id}
                type="button"
                id={`service-card-${s.id}`}
                onClick={() => setSelectedService(s)}
                className={`flex items-start justify-between text-left p-4 rounded-xl border transition-all w-full cursor-pointer min-h-[80px] outline-none ${
                  selectedService?.id === s.id
                    ? "border-indigo-600 bg-indigo-50/40 ring-2 ring-indigo-600/10"
                    : "border-gray-200 hover:border-gray-300 bg-white"
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900 text-base">{s.name}</span>
                    <span className="text-xs font-mono bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded uppercase">{s.code}</span>
                  </div>
                  {s.description && <p className="text-sm text-gray-500 max-w-xl">{s.description}</p>}
                </div>
                <div className="text-right shrink-0">
                  <span className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full whitespace-nowrap">
                    <ClockIcon className="w-3.5 h-3.5" />
                    {s.durationMinutes} min
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  // Step 3 Render: Date & Time Selection
  const renderDateTimeStep = () => {
    // Restrict date input to today onwards
    const todayStr = new Date().toISOString().split("T")[0];

    return (
      <div className="space-y-5" id="step-datetime-selection">
        <div>
          <h3 className="text-lg font-medium text-gray-900">Select Date & Time</h3>
          <p className="text-sm text-gray-500">Choose your preferred visit timeslot.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-gray-700" htmlFor="booking-date">
              Select Appointment Date
            </label>
            <div className="relative">
              <input
                id="booking-date"
                type="date"
                min={todayStr}
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full h-11 px-3 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="space-y-2">
            <span className="block text-sm font-semibold text-gray-700">
              Select Time Slot (UTC)
            </span>
            <div className="grid grid-cols-3 gap-2 max-h-56 overflow-y-auto p-1 border border-gray-200 rounded-lg" id="time-slots-grid">
              {DEFAULT_TIME_SLOTS.map(t => (
                <button
                  key={t}
                  type="button"
                  id={`time-slot-${t.replace(":", "")}`}
                  onClick={() => setSelectedTime(t)}
                  className={`h-11 flex items-center justify-center text-sm font-medium rounded-lg border transition-all cursor-pointer outline-none ${
                    selectedTime === t
                      ? "border-indigo-600 bg-indigo-600 text-white"
                      : "border-gray-200 hover:border-gray-300 bg-white text-gray-700"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Step 4 Render: Customer Details
  const renderCustomerDetailsStep = () => {
    return (
      <div className="space-y-5" id="step-customer-details">
        <div>
          <h3 className="text-lg font-medium text-gray-900">Customer Details</h3>
          <p className="text-sm text-gray-500">Provide your contact information to finish reservation.</p>
        </div>

        <div className="space-y-4">
          <div className="space-y-1">
            <label className="block text-sm font-semibold text-gray-700" htmlFor="customer-fullname">
              Full Name
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                <UserIcon className="w-5 h-5 text-gray-400" />
              </span>
              <input
                id="customer-fullname"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="John Doe"
                className={`w-full h-11 pl-10 pr-3 border rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 ${
                  fieldErrors.fullName ? "border-red-500" : "border-gray-300"
                }`}
              />
            </div>
            {fieldErrors.fullName && (
              <p className="text-xs text-red-600 flex items-center gap-1 mt-1" id="error-fullName">
                <AlertCircle className="w-3.5 h-3.5" /> {fieldErrors.fullName}
              </p>
            )}
          </div>

          <div className="space-y-1">
            <label className="block text-sm font-semibold text-gray-700" htmlFor="customer-email">
              Email Address
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                <MailIcon className="w-5 h-5 text-gray-400" />
              </span>
              <input
                id="customer-email"
                type="email"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                placeholder="customer@example.com"
                className={`w-full h-11 pl-10 pr-3 border rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 ${
                  fieldErrors.email ? "border-red-500" : "border-gray-300"
                }`}
              />
            </div>
            {fieldErrors.email && (
              <p className="text-xs text-red-600 flex items-center gap-1 mt-1" id="error-email">
                <AlertCircle className="w-3.5 h-3.5" /> {fieldErrors.email}
              </p>
            )}
          </div>

          <div className="space-y-1">
            <label className="block text-sm font-semibold text-gray-700" htmlFor="customer-phone">
              Phone Number
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                <PhoneIcon className="w-5 h-5 text-gray-400" />
              </span>
              <input
                id="customer-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 234 567 890"
                className={`w-full h-11 pl-10 pr-3 border rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 ${
                  fieldErrors.phone ? "border-red-500" : "border-gray-300"
                }`}
              />
            </div>
            {fieldErrors.phone && (
              <p className="text-xs text-red-600 flex items-center gap-1 mt-1" id="error-phone">
                <AlertCircle className="w-3.5 h-3.5" /> {fieldErrors.phone}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Step 5 Render: Review & Confirmation Summary
  const renderConfirmationStep = () => {
    return (
      <div className="space-y-5" id="step-review-confirmation">
        <div>
          <h3 className="text-lg font-medium text-gray-900">Review & Confirm</h3>
          <p className="text-sm text-gray-500">Please review your appointment details prior to submission.</p>
        </div>

        <div className="bg-gray-50 border border-gray-150 rounded-xl p-5 space-y-4" id="review-summary-box">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <span className="block text-xs text-gray-400 uppercase font-bold tracking-wider">Branch Location</span>
              <span className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                <Building className="w-4 h-4 text-indigo-500" />
                {selectedBranch?.name}
              </span>
              <span className="block text-xs text-gray-500 pl-5">{selectedBranch?.address}</span>
            </div>

            <div className="space-y-1">
              <span className="block text-xs text-gray-400 uppercase font-bold tracking-wider">Requested Service</span>
              <span className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                <Briefcase className="w-4 h-4 text-indigo-500" />
                {selectedService?.name}
              </span>
              <span className="block text-xs text-gray-500 pl-5">Duration: {selectedService?.durationMinutes} minutes</span>
            </div>

            <div className="space-y-1">
              <span className="block text-xs text-gray-400 uppercase font-bold tracking-wider">Date & Time Slot</span>
              <span className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                <CalendarIcon className="w-4 h-4 text-indigo-500" />
                {selectedDate}
              </span>
              <span className="text-sm font-medium text-gray-700 flex items-center gap-1.5 pl-5">
                <ClockIcon className="w-3.5 h-3.5 text-gray-400" />
                {selectedTime} UTC
              </span>
            </div>

            <div className="space-y-1">
              <span className="block text-xs text-gray-400 uppercase font-bold tracking-wider">Your Details</span>
              <span className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                <UserIcon className="w-4 h-4 text-indigo-500" />
                {fullName}
              </span>
              <span className="block text-xs text-gray-500 pl-5">Email: {customerEmail}</span>
              <span className="block text-xs text-gray-500 pl-5">Phone: {phone}</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Success Screen
  if (bookingStatus === "success" && createdAppointment) {
    return (
      <div className="text-center py-10 px-4 max-w-md mx-auto space-y-6" id="booking-success-view">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-50 text-green-600 mb-2">
          <CheckCircle className="w-10 h-10" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-gray-900">Appointment Confirmed!</h2>
          <p className="text-sm text-gray-500">
            Thank you for scheduling with us. Your appointment request has been finalized successfully.
          </p>
        </div>

        <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 text-left space-y-3" id="success-summary-box">
          <div className="flex justify-between border-b border-gray-150 pb-2">
            <span className="text-xs text-gray-400 uppercase font-semibold">Appointment ID</span>
            <span className="text-xs font-mono text-gray-700 font-bold">{createdAppointment.id}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-gray-500">Branch</span>
            <span className="text-sm font-medium text-gray-900">{selectedBranch?.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-gray-500">Service</span>
            <span className="text-sm font-medium text-gray-900">{selectedService?.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-gray-500">Date</span>
            <span className="text-sm font-medium text-gray-900">{selectedDate}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-gray-500">Time (UTC)</span>
            <span className="text-sm font-medium text-gray-900">{selectedTime}</span>
          </div>
        </div>

        <div className="pt-4 flex flex-col gap-2">
          <button
            type="button"
            id="book-another-button"
            onClick={resetWizard}
            className="w-full h-11 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition-colors cursor-pointer"
          >
            Book another appointment
          </button>
          {onBackToLogin && (
            <button
              type="button"
              onClick={onBackToLogin}
              className="w-full h-11 border border-gray-200 text-gray-600 hover:bg-gray-50 bg-white rounded-lg font-semibold transition-colors cursor-pointer"
            >
              Return to main console
            </button>
          )}
        </div>
      </div>
    );
  }

  // Error Screen
  if (bookingStatus === "error") {
    return (
      <div className="text-center py-10 px-4 max-w-md mx-auto space-y-6" id="booking-error-view">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-50 text-red-600 mb-2">
          <AlertCircle className="w-10 h-10" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-gray-900">Booking Failed</h2>
          <p className="text-sm text-gray-500">
            We were unable to secure your appointment request.
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-4 font-medium text-left">
            {error}
          </div>
        )}

        <div className="pt-4 flex flex-col gap-2">
          <button
            type="button"
            id="retry-booking-button"
            onClick={() => setBookingStatus("idle")}
            className="w-full h-11 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" /> Retry booking attempt
          </button>
          <button
            type="button"
            onClick={resetWizard}
            className="w-full h-11 border border-gray-200 text-gray-600 hover:bg-gray-50 bg-white rounded-lg font-semibold transition-colors cursor-pointer"
          >
            Start over from branch choice
          </button>
        </div>
      </div>
    );
  }

  // Tenant selection view (shown if tenant slug isn't confirmed)
  if (!isTenantConfirmed) {
    return (
      <div className="max-w-md mx-auto p-6 bg-white border border-gray-200 rounded-2xl shadow-sm space-y-6" id="tenant-slug-prompt">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900">Find Organization</h2>
          <p className="text-sm text-gray-500 mt-1">Please enter the organization slug to start booking.</p>
        </div>

        <div className="space-y-4">
          <div className="space-y-1">
            <label className="block text-sm font-semibold text-gray-700" htmlFor="tenant-input">
              Organization Slug
            </label>
            <div className="flex border border-gray-300 rounded-lg overflow-hidden h-11 items-center bg-gray-50 pr-2">
              <span className="text-gray-400 text-sm px-3 select-none">klerion.app/</span>
              <input
                id="tenant-input"
                type="text"
                value={tenantSlug}
                onChange={(e) => setTenantSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                placeholder="acme-clinics"
                className="flex-1 h-full bg-white px-2 focus:outline-none text-gray-900 font-medium"
              />
            </div>
          </div>

          <button
            type="button"
            id="confirm-tenant-slug-btn"
            disabled={!tenantSlug.trim()}
            onClick={() => setIsTenantConfirmed(true)}
            className="w-full h-11 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 disabled:bg-gray-200 disabled:text-gray-400 transition-colors flex items-center justify-center gap-1 cursor-pointer"
          >
            Continue to Branch discovery <ArrowRight className="w-4 h-4" />
          </button>

          {onBackToLogin && (
            <button
              type="button"
              onClick={onBackToLogin}
              className="w-full text-center text-sm font-medium text-gray-500 hover:text-gray-700 cursor-pointer"
            >
              Cancel and return to login
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden" id="booking-wizard-container">
      {/* Progress Bar & Header */}
      <div className="border-b border-gray-150 p-6 bg-gray-50/50">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Customer Scheduling</h2>
            <p className="text-xs text-indigo-600 font-semibold uppercase tracking-wider mt-0.5">klerion.app/{tenantSlug}</p>
          </div>
          {/* Progress Indicator */}
          <div className="flex items-center gap-2" id="progress-indicator-labels">
            <span className="text-sm font-semibold text-indigo-600">Step {step} of 5</span>
            <div className="w-24 bg-gray-200 h-2 rounded-full overflow-hidden">
              <div 
                className="bg-indigo-600 h-full transition-all duration-300"
                style={{ width: `${(step / 5) * 100}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Dynamic Step Body */}
      <div className="p-6 min-h-[250px]">
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg font-medium flex items-start gap-2" id="step-error-banner">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {step === 1 && renderBranchStep()}
        {step === 2 && renderServiceStep()}
        {step === 3 && renderDateTimeStep()}
        {step === 4 && renderCustomerDetailsStep()}
        {step === 5 && renderConfirmationStep()}
      </div>

      {/* Bottom Navigation Panel */}
      <div className="border-t border-gray-150 p-6 flex justify-between bg-gray-50/50">
        <button
          type="button"
          id="wizard-back-button"
          disabled={step === 1 || submitting}
          onClick={handleBackStep}
          className="h-11 px-5 border border-gray-200 hover:bg-gray-100 disabled:opacity-40 text-gray-600 font-semibold rounded-lg transition-colors flex items-center gap-2 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        {step < 5 ? (
          <button
            type="button"
            id="wizard-next-button"
            onClick={handleNextStep}
            className="h-11 px-6 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg transition-colors flex items-center gap-2 cursor-pointer"
          >
            Next <ArrowRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            type="button"
            id="wizard-confirm-button"
            disabled={submitting}
            onClick={handleConfirmBooking}
            className="h-11 px-6 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-semibold rounded-lg transition-colors flex items-center gap-2 cursor-pointer"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Finalizing Booking...
              </>
            ) : (
              <>
                Confirm Booking <CheckCircle className="w-4 h-4" />
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
