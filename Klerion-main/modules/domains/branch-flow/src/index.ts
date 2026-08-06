export interface Appointment {
  id: string;
  tenantId: string;
  customerName: string;
  status: "BOOKED" | "COMPLETED" | "CANCELLED";
  scheduledAt: string;
}
