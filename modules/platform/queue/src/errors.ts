export class QueueValidationError extends Error {
  constructor(message: string) { super(message); this.name = "QueueValidationError"; }
}
export class QueueConfigurationNotFoundError extends Error {
  constructor(branchId: string, serviceId: string) { super(`Queue configuration was not found for branch '${branchId}' and service '${serviceId}'`); this.name = "QueueConfigurationNotFoundError"; }
}
export class QueueEntryNotFoundError extends Error {
  constructor(id: string) { super(`Queue entry '${id}' was not found`); this.name = "QueueEntryNotFoundError"; }
}
export class QueueStateError extends Error {
  constructor(message: string) { super(message); this.name = "QueueStateError"; }
}
export class QueueCapacityError extends Error {
  constructor(message: string) { super(message); this.name = "QueueCapacityError"; }
}
