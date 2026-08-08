export class ServiceDeskValidationError extends Error {
  constructor(message: string) { super(message); this.name = "ServiceDeskValidationError"; }
}

export class ServiceDeskCatalogItemNotFoundError extends Error {
  constructor(id: string) { super(`Service desk catalogue item '${id}' was not found`); this.name = "ServiceDeskCatalogItemNotFoundError"; }
}

export class ServiceDeskTicketNotFoundError extends Error {
  constructor(id: string) { super(`Service desk ticket '${id}' was not found`); this.name = "ServiceDeskTicketNotFoundError"; }
}

export class ServiceDeskSlaPolicyNotFoundError extends Error {
  constructor(id: string) { super(`Service desk SLA policy '${id}' was not found`); this.name = "ServiceDeskSlaPolicyNotFoundError"; }
}

export class ServiceDeskAccessError extends Error {
  constructor(message = "You do not have access to this service desk ticket") { super(message); this.name = "ServiceDeskAccessError"; }
}
