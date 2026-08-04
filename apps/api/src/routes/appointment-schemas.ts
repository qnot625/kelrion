import { Type, type Static } from "@sinclair/typebox";
import { TypeCompiler } from "@sinclair/typebox/compiler";

export class AppointmentSchemaValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AppointmentSchemaValidationError";
  }
}

export const BookAppointmentBodySchema = Type.Object(
  {
    customerEmail: Type.String({ minLength: 1 }), // Basic non-empty string check
    branchId: Type.String({ minLength: 1 }),
    serviceId: Type.String({ minLength: 1 }),
    customerMetadata: Type.Optional(Type.Record(Type.String(), Type.Any())),
    startAt: Type.String(),
    endAt: Type.String(),
  },
  { additionalProperties: false }
);

export type BookAppointmentBody = Static<typeof BookAppointmentBodySchema>;

const bookAppointmentCompiler = TypeCompiler.Compile(BookAppointmentBodySchema);

export function validateBookAppointmentBody(body: unknown): BookAppointmentBody {
  if (!bookAppointmentCompiler.Check(body)) {
    const errors = [...bookAppointmentCompiler.Errors(body)];
    const message = errors.map((e) => `${e.path} ${e.message}`).join(", ");
    throw new AppointmentSchemaValidationError(`Validation failed: ${message}`);
  }
  
  if (Number.isNaN(Date.parse(body.startAt))) {
    throw new AppointmentSchemaValidationError("startAt must be a valid ISO-8601 date-time string");
  }
  
  if (Number.isNaN(Date.parse(body.endAt))) {
    throw new AppointmentSchemaValidationError("endAt must be a valid ISO-8601 date-time string");
  }

  return body;
}

export function handleAppointmentDomainError(error: unknown): { status: number; body: { error: string } } | undefined {
  if (error instanceof AppointmentSchemaValidationError) {
    return { status: 400, body: { error: error.message } };
  }
  return undefined;
}

export const RescheduleAppointmentBodySchema = Type.Object(
  {
    startAt: Type.String(),
    endAt: Type.String(),
  },
  { additionalProperties: false }
);

export type RescheduleAppointmentBody = Static<typeof RescheduleAppointmentBodySchema>;

const rescheduleAppointmentCompiler = TypeCompiler.Compile(RescheduleAppointmentBodySchema);

export function validateRescheduleAppointmentBody(body: unknown): RescheduleAppointmentBody {
  if (!rescheduleAppointmentCompiler.Check(body)) {
    const errors = [...rescheduleAppointmentCompiler.Errors(body)];
    const message = errors.map((e) => `${e.path} ${e.message}`).join(", ");
    throw new AppointmentSchemaValidationError(`Validation failed: ${message}`);
  }
  
  if (Number.isNaN(Date.parse(body.startAt))) {
    throw new AppointmentSchemaValidationError("startAt must be a valid ISO-8601 date-time string");
  }
  
  if (Number.isNaN(Date.parse(body.endAt))) {
    throw new AppointmentSchemaValidationError("endAt must be a valid ISO-8601 date-time string");
  }

  return body;
}

export const AppointmentIdParamsSchema = Type.Object(
  {
    id: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false }
);

export type AppointmentIdParams = Static<typeof AppointmentIdParamsSchema>;

const appointmentIdParamsCompiler = TypeCompiler.Compile(AppointmentIdParamsSchema);

export function validateAppointmentIdParams(params: unknown): AppointmentIdParams {
  if (!appointmentIdParamsCompiler.Check(params)) {
    const errors = [...appointmentIdParamsCompiler.Errors(params)];
    const message = errors.map((e) => `${e.path} ${e.message}`).join(", ");
    throw new AppointmentSchemaValidationError(`Validation failed: ${message}`);
  }
  return params as AppointmentIdParams;
}

