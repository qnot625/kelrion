import { ServiceTicket } from './service-ticket.js';
import { TicketFilterOptions, ServiceDeskMetrics } from './types.js';

export interface ServiceTicketRepository {
  save(ticket: ServiceTicket): Promise<void>;
  findById(tenantId: string, id: string): Promise<ServiceTicket | null>;
  findByTicketNumber(tenantId: string, ticketNumber: string): Promise<ServiceTicket | null>;
  findAll(tenantId: string, options?: TicketFilterOptions): Promise<{ items: ServiceTicket[]; total: number }>;
  delete(tenantId: string, id: string): Promise<void>;
  getMetrics(tenantId: string): Promise<ServiceDeskMetrics>;
}
