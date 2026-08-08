export class WorkflowValidationError extends Error {
  constructor(message: string) { super(message); this.name = "WorkflowValidationError"; }
}

export class WorkflowDefinitionNotFoundError extends Error {
  constructor(id: string) { super(`Workflow definition '${id}' was not found`); this.name = "WorkflowDefinitionNotFoundError"; }
}

export class WorkflowInstanceNotFoundError extends Error {
  constructor(id: string) { super(`Workflow instance '${id}' was not found`); this.name = "WorkflowInstanceNotFoundError"; }
}

export class HumanTaskNotFoundError extends Error {
  constructor(id: string) { super(`Human task '${id}' was not found`); this.name = "HumanTaskNotFoundError"; }
}

export class WorkflowAccessError extends Error {
  constructor(message = "You do not have access to this workflow task") { super(message); this.name = "WorkflowAccessError"; }
}
