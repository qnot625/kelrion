import { Type, type Static } from "@sinclair/typebox";
import { TypeCompiler } from "@sinclair/typebox/compiler";

export class WaitlistSchemaValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WaitlistSchemaValidationError";
  }
}

export const AddToWaitlistBodySchema = Type.Object(
  {
    branchId: Type.String({ minLength: 1 }),
    serviceId: Type.String({ minLength: 1 }),
    customerEmail: Type.String({ minLength: 1 }),
    customerMetadata: Type.Optional(Type.Record(Type.String(), Type.Any())),
  },
  { additionalProperties: false }
);

export type AddToWaitlistBody = Static<typeof AddToWaitlistBodySchema>;

const addToWaitlistCompiler = TypeCompiler.Compile(AddToWaitlistBodySchema);

export function validateAddToWaitlistBody(body: unknown): AddToWaitlistBody {
  if (!addToWaitlistCompiler.Check(body)) {
    const errors = [...addToWaitlistCompiler.Errors(body)];
    const message = errors.map((e) => `${e.path} ${e.message}`).join(", ");
    throw new WaitlistSchemaValidationError(`Validation failed: ${message}`);
  }
  return body as AddToWaitlistBody;
}

export const WaitlistIdParamsSchema = Type.Object(
  {
    id: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false }
);

export type WaitlistIdParams = Static<typeof WaitlistIdParamsSchema>;

const waitlistIdParamsCompiler = TypeCompiler.Compile(WaitlistIdParamsSchema);

export function validateWaitlistIdParams(params: unknown): WaitlistIdParams {
  if (!waitlistIdParamsCompiler.Check(params)) {
    const errors = [...waitlistIdParamsCompiler.Errors(params)];
    const message = errors.map((e) => `${e.path} ${e.message}`).join(", ");
    throw new WaitlistSchemaValidationError(`Validation failed: ${message}`);
  }
  return params as WaitlistIdParams;
}

export function handleWaitlistDomainError(error: unknown): { status: number; body: { error: string } } | undefined {
  if (error instanceof WaitlistSchemaValidationError) {
    return { status: 400, body: { error: error.message } };
  }
  return undefined;
}
