import { QueueEntryNotFoundError, QueueValidationError } from "./errors.js";
import type { QueueService } from "./queue-service.js";
import type { AppointmentCheckInFacts, QueueCheckInSource, QueuePriority } from "./types.js";

export type AppointmentFactsResolver = (tenantId: string, appointmentId: string) => Promise<AppointmentCheckInFacts | null>;
export class QueueCheckInService {
  constructor(private readonly queue: QueueService, private readonly resolveAppointment: AppointmentFactsResolver) {}
  checkInWalkIn(input: Parameters<QueueService["checkInWalkIn"]>[0]) { return this.queue.checkInWalkIn(input); }
  async checkInAppointment(input:{tenantId:string;appointmentId:string;priority?:QueuePriority;priorityAdjustment?:number;source?:QueueCheckInSource;idempotencyKey?:string|null;metadata?:Record<string,unknown>;actorUserId?:string|null;now?:Date}) {
    const appointment=await this.resolveAppointment(input.tenantId,input.appointmentId); if(!appointment) throw new QueueEntryNotFoundError(input.appointmentId); if(appointment.appointmentId!==input.appointmentId) throw new QueueValidationError("Appointment resolver returned a mismatched appointment"); return this.queue.checkInAppointment({tenantId:input.tenantId,appointment,priority:input.priority,priorityAdjustment:input.priorityAdjustment,source:input.source,idempotencyKey:input.idempotencyKey,metadata:input.metadata,actorUserId:input.actorUserId,now:input.now});
  }
}
