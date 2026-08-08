export class FormsValidationError extends Error {
  constructor(message: string) { super(message); this.name = "FormsValidationError"; }
}

export class FormDefinitionNotFoundError extends Error {
  constructor(id: string) { super(`Form definition '${id}' was not found`); this.name = "FormDefinitionNotFoundError"; }
}

export class FormSubmissionNotFoundError extends Error {
  constructor(id: string) { super(`Form submission '${id}' was not found`); this.name = "FormSubmissionNotFoundError"; }
}

export class FormAccessError extends Error {
  constructor(message = "You do not have access to this form submission") { super(message); this.name = "FormAccessError"; }
}
