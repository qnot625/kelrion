import type { FastifyInstance } from "fastify";
import {
  FormAccessError,
  FormDefinitionNotFoundError,
  FormSubmissionNotFoundError,
  FormsValidationError,
  type FormDefinitionService,
  type FormFieldProps,
  type SubmissionService,
} from "@adminops/forms";
import { hasPermission } from "@adminops/identity";
import type { ControlPlaneService } from "@adminops/control-plane";
import { requireModule } from "../plugins/module-entitlement.js";
import { requirePermission } from "../plugins/require-permission.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function nullableText(value: unknown): string | null | undefined {
  return value === null ? null : text(value);
}

function parseFields(value: unknown): FormFieldProps[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new FormsValidationError("fields must be an array");
  return value.map((item, index) => {
    if (!isRecord(item) || typeof item.id !== "string" || typeof item.label !== "string" || typeof item.type !== "string") {
      throw new FormsValidationError(`fields[${index}] must include id, label and type`);
    }
    return item as unknown as FormFieldProps;
  });
}

function parseResponses(value: unknown): Array<{ fieldId: string; value: unknown }> {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new FormsValidationError("responses must be an array");
  return value.map((item, index) => {
    if (!isRecord(item) || typeof item.fieldId !== "string") {
      throw new FormsValidationError(`responses[${index}] must include fieldId`);
    }
    return { fieldId: item.fieldId, value: item.value };
  });
}

function metadata(value: unknown) {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new FormsValidationError("metadata must be an object");
  return {
    sourceChannel: text(value.sourceChannel),
    locale: text(value.locale),
    tags: Array.isArray(value.tags) && value.tags.every((tag) => typeof tag === "string") ? value.tags as string[] : undefined,
    ipAddress: nullableText(value.ipAddress),
    userAgent: nullableText(value.userAgent),
  };
}

function errorResponse(error: unknown): { status: number; message: string } | null {
  if (error instanceof FormDefinitionNotFoundError || error instanceof FormSubmissionNotFoundError) {
    return { status: 404, message: error.message };
  }
  if (error instanceof FormAccessError) return { status: 403, message: error.message };
  if (error instanceof FormsValidationError) return { status: 400, message: error.message };
  return null;
}

async function handle<T>(
  reply: { code(status: number): { send(body: unknown): T } },
  operation: () => Promise<unknown>,
): Promise<unknown> {
  try { return await operation(); }
  catch (error) {
    const mapped = errorResponse(error);
    if (!mapped) throw error;
    return reply.code(mapped.status).send({ error: mapped.message });
  }
}

export function registerFormsRoutes(
  app: FastifyInstance,
  forms: FormDefinitionService,
  submissions: SubmissionService,
  controlPlane: ControlPlaneService,
): void {
  const moduleGuard = requireModule(controlPlane, "forms");

  app.get("/forms", { preHandler: [moduleGuard, requirePermission("forms:submit")] }, async (request, reply) => {
    const canManage = hasPermission(request.auth!.roles, "forms:manage");
    const list = canManage ? await forms.list(request.tenant!.tenantId) : await forms.listPublished(request.tenant!.tenantId);
    return reply.send(list.map((form) => form.toJSON()));
  });

  app.get<{ Params: { id: string } }>("/forms/:id", { preHandler: [moduleGuard, requirePermission("forms:submit")] }, async (request, reply) =>
    handle(reply, async () => {
      const canManage = hasPermission(request.auth!.roles, "forms:manage");
      const query = request.query as { version?: string };
      const version = query.version ? Number(query.version) : undefined;
      if (query.version && (!Number.isInteger(version) || (version ?? 0) < 1)) {
        throw new FormsValidationError("version must be a positive integer");
      }
      const form = canManage && version === undefined
        ? await forms.get(request.tenant!.tenantId, request.params.id)
        : await forms.getPublished(request.tenant!.tenantId, request.params.id, version);
      return reply.send(form.toJSON());
    }));

  app.get<{ Params: { id: string } }>("/forms/:id/versions", { preHandler: [moduleGuard, requirePermission("forms:manage")] }, async (request, reply) =>
    handle(reply, async () => reply.send((await forms.listVersions(request.tenant!.tenantId, request.params.id)).map((form) => form.toJSON()))));

  app.post("/forms", { preHandler: [moduleGuard, requirePermission("forms:manage")] }, async (request, reply) =>
    handle(reply, async () => {
      const body = isRecord(request.body) ? request.body : {};
      if (typeof body.title !== "string" || !body.title.trim()) throw new FormsValidationError("title is required");
      const form = await forms.createForm({
        tenantId: request.tenant!.tenantId,
        id: text(body.id),
        title: body.title,
        description: text(body.description),
        fields: parseFields(body.fields),
        locale: text(body.locale),
        templateKey: nullableText(body.templateKey),
        actorUserId: request.auth!.userId,
      });
      return reply.code(201).send(form.toJSON());
    }));

  app.patch<{ Params: { id: string } }>("/forms/:id", { preHandler: [moduleGuard, requirePermission("forms:manage")] }, async (request, reply) =>
    handle(reply, async () => {
      const body = isRecord(request.body) ? request.body : {};
      const form = await forms.updateDraft({
        tenantId: request.tenant!.tenantId,
        id: request.params.id,
        title: text(body.title),
        description: text(body.description),
        fields: parseFields(body.fields),
        locale: text(body.locale),
        templateKey: nullableText(body.templateKey),
        actorUserId: request.auth!.userId,
      });
      return reply.send(form.toJSON());
    }));

  app.post<{ Params: { id: string } }>("/forms/:id/publish", { preHandler: [moduleGuard, requirePermission("forms:manage")] }, async (request, reply) =>
    handle(reply, async () => reply.send((await forms.publish({
      tenantId: request.tenant!.tenantId,
      id: request.params.id,
      actorUserId: request.auth!.userId,
    })).toJSON())));

  app.post<{ Params: { id: string } }>("/forms/:id/archive", { preHandler: [moduleGuard, requirePermission("forms:manage")] }, async (request, reply) =>
    handle(reply, async () => reply.send((await forms.archive({
      tenantId: request.tenant!.tenantId,
      id: request.params.id,
      actorUserId: request.auth!.userId,
    })).toJSON())));

  app.post<{ Params: { id: string } }>("/forms/:id/drafts", { preHandler: [moduleGuard, requirePermission("forms:submit")] }, async (request, reply) =>
    handle(reply, async () => {
      const body = isRecord(request.body) ? request.body : {};
      const draft = await submissions.createDraft({
        tenantId: request.tenant!.tenantId,
        formDefinitionId: request.params.id,
        actorUserId: request.auth!.userId,
        id: text(body.id),
        responses: parseResponses(body.responses),
        metadata: metadata(body.metadata),
      });
      return reply.code(201).send(draft.toJSON());
    }));

  app.get("/form-submissions", { preHandler: [moduleGuard, requirePermission("forms:submit")] }, async (request, reply) => {
    const canManage = hasPermission(request.auth!.roles, "forms:manage");
    const query = request.query as { formId?: string; scope?: string };
    if (query.scope === "all" && !canManage) return reply.code(403).send({ error: 'Missing permission "forms:manage"' });
    if (query.scope === "all" && query.formId) return reply.send((await submissions.listForForm(request.tenant!.tenantId, query.formId)).map((item) => item.toJSON()));
    if (query.scope === "all") {
      const all = await Promise.all((await forms.list(request.tenant!.tenantId)).map((form) => submissions.listForForm(request.tenant!.tenantId, form.id)));
      return reply.send(all.flat().map((item) => item.toJSON()));
    }
    return reply.send((await submissions.listOwn(request.tenant!.tenantId, request.auth!.userId)).map((item) => item.toJSON()));
  });

  app.get<{ Params: { id: string } }>("/form-submissions/:id", { preHandler: [moduleGuard, requirePermission("forms:submit")] }, async (request, reply) =>
    handle(reply, async () => reply.send((await submissions.get({
      tenantId: request.tenant!.tenantId,
      id: request.params.id,
      actorUserId: request.auth!.userId,
      canManage: hasPermission(request.auth!.roles, "forms:manage"),
    })).toJSON())));

  app.put<{ Params: { id: string } }>("/form-submissions/:id", { preHandler: [moduleGuard, requirePermission("forms:submit")] }, async (request, reply) =>
    handle(reply, async () => {
      const body = isRecord(request.body) ? request.body : {};
      const result = await submissions.saveDraft({
        tenantId: request.tenant!.tenantId,
        id: request.params.id,
        actorUserId: request.auth!.userId,
        canManage: hasPermission(request.auth!.roles, "forms:manage"),
        responses: parseResponses(body.responses),
        metadata: metadata(body.metadata),
      });
      return reply.send(result.toJSON());
    }));

  app.post<{ Params: { id: string } }>("/form-submissions/:id/submit", { preHandler: [moduleGuard, requirePermission("forms:submit")] }, async (request, reply) =>
    handle(reply, async () => {
      const body = isRecord(request.body) ? request.body : {};
      const result = await submissions.submit({
        tenantId: request.tenant!.tenantId,
        id: request.params.id,
        actorUserId: request.auth!.userId,
        canManage: hasPermission(request.auth!.roles, "forms:manage"),
        responses: body.responses === undefined ? undefined : parseResponses(body.responses),
        metadata: metadata(body.metadata),
      });
      return reply.send(result.toJSON());
    }));

  app.post<{ Params: { id: string } }>("/form-submissions/:id/validate", { preHandler: [moduleGuard, requirePermission("forms:manage")] }, async (request, reply) =>
    handle(reply, async () => reply.send((await submissions.validate({
      tenantId: request.tenant!.tenantId,
      id: request.params.id,
      actorUserId: request.auth!.userId,
    })).toJSON())));

  app.delete<{ Params: { id: string } }>("/form-submissions/:id", { preHandler: [moduleGuard, requirePermission("forms:submit")] }, async (request, reply) =>
    handle(reply, async () => {
      await submissions.deleteDraft({
        tenantId: request.tenant!.tenantId,
        id: request.params.id,
        actorUserId: request.auth!.userId,
        canManage: hasPermission(request.auth!.roles, "forms:manage"),
      });
      return reply.code(204).send(undefined);
    }));
}
