export class ApprovalValidationError extends Error {
  constructor(message: string) { super(message); this.name = "ApprovalValidationError"; }
}

export class ApprovalPolicyNotFoundError extends Error {
  constructor(id: string) { super(`Approval policy '${id}' was not found`); this.name = "ApprovalPolicyNotFoundError"; }
}

export class ApprovalRequestNotFoundError extends Error {
  constructor(id: string) { super(`Approval request '${id}' was not found`); this.name = "ApprovalRequestNotFoundError"; }
}

export class ApprovalAccessError extends Error {
  constructor(message = "You do not have access to this approval request") { super(message); this.name = "ApprovalAccessError"; }
}
