import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  FormDefinitionService,
  InMemoryFormDefinitionRepository,
  SubmissionService,
  InMemoryFormSubmissionRepository,
  FormField,
  FieldResponse,
  SubmissionMetadata,
  type FormFieldProps,
} from "../../../../modules/platform/forms/src/index.js";
import { getOrchestrator } from "../orchestrator.js";

// Singletons for in-memory persistence across routes
export const formDefinitionRepository = new InMemoryFormDefinitionRepository();
export const formSubmissionRepository = new InMemoryFormSubmissionRepository();

export const formDefinitionService = new FormDefinitionService(formDefinitionRepository);
export const submissionService = new SubmissionService(
  formSubmissionRepository,
  formDefinitionRepository,
);

export function getSecurityContext(req: FastifyRequest) {
  const tenantId = (req.headers["x-tenant-id"] as string)?.trim() || "tenant-default";
  const userId = (req.headers["x-user-id"] as string)?.trim() || "user-1";
  const role = (req.headers["x-user-role"] as string)?.trim().toLowerCase() || "admin";
  return { tenantId, userId, role };
}

function checkAdminOrOwner(role: string, reply: FastifyReply): boolean {
  if (role !== "admin" && role !== "owner") {
    reply.status(403).send({ error: "Forbidden: Admin or Owner role required" });
    return false;
  }
  return true;
}

export async function formsRoutes(fastify: FastifyInstance) {
  // 1. Create Form Definition
  fastify.post("/", async (req: FastifyRequest, reply: FastifyReply) => {
    const { tenantId, userId, role } = getSecurityContext(req);
    if (!checkAdminOrOwner(role, reply)) return;

    const body = req.body as {
      id?: string;
      title?: string;
      description?: string;
      fields?: FormFieldProps[];
    };

    if (!body || !body.title || body.title.trim() === "") {
      return reply.status(400).send({ error: "Form title is required" });
    }

    const formId = body.id || `form-${Date.now()}`;
    const fields = (body.fields || []).map((f) => new FormField(f));

    try {
      const formDef = await formDefinitionService.createForm({
        id: formId,
        tenantId,
        title: body.title,
        description: body.description,
        fields,
        actorUserId: userId,
      });

      return reply.status(201).send({ form: formDef.toJSON() });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message || "Failed to create form definition" });
    }
  });

  // 2. Update Draft Form Definition
  fastify.put("/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    const { tenantId, userId, role } = getSecurityContext(req);
    if (!checkAdminOrOwner(role, reply)) return;

    const { id } = req.params as { id: string };
    const body = req.body as {
      title?: string;
      description?: string;
      fields?: FormFieldProps[];
    };

    try {
      const existing = await formDefinitionService.getForm(tenantId, id);
      const title = body.title || existing.title;
      const description = body.description ?? existing.description;
      const fields = body.fields ? body.fields.map((f) => new FormField(f)) : existing.fields;

      const formDef = await formDefinitionService.updateFormDraft({
        id,
        tenantId,
        title,
        description,
        fields,
        actorUserId: userId,
      });

      return reply.status(200).send({ form: formDef.toJSON() });
    } catch (err: any) {
      const status = err.message?.includes("not found") ? 404 : 400;
      return reply.status(status).send({ error: err.message || "Failed to update form" });
    }
  });

  // 3. Publish Form Version
  fastify.post("/:id/publish", async (req: FastifyRequest, reply: FastifyReply) => {
    const { tenantId, userId, role } = getSecurityContext(req);
    if (!checkAdminOrOwner(role, reply)) return;

    const { id } = req.params as { id: string };

    try {
      const formDef = await formDefinitionService.publishForm({
        tenantId,
        id,
        actorUserId: userId,
      });
      return reply.status(200).send({ form: formDef.toJSON() });
    } catch (err: any) {
      const status = err.message?.includes("not found") ? 404 : 400;
      return reply.status(status).send({ error: err.message || "Failed to publish form" });
    }
  });

  // 4. Archive Form
  fastify.post("/:id/archive", async (req: FastifyRequest, reply: FastifyReply) => {
    const { tenantId, userId, role } = getSecurityContext(req);
    if (!checkAdminOrOwner(role, reply)) return;

    const { id } = req.params as { id: string };

    try {
      const formDef = await formDefinitionService.archiveForm({
        tenantId,
        id,
        actorUserId: userId,
      });
      return reply.status(200).send({ form: formDef.toJSON() });
    } catch (err: any) {
      const status = err.message?.includes("not found") ? 404 : 400;
      return reply.status(status).send({ error: err.message || "Failed to archive form" });
    }
  });

  // 5. List Forms
  fastify.get("/", async (req: FastifyRequest, reply: FastifyReply) => {
    const { tenantId } = getSecurityContext(req);
    const query = req.query as { status?: "DRAFT" | "PUBLISHED" | "ARCHIVED" };

    try {
      let forms = await formDefinitionService.listForms(tenantId);
      if (query.status) {
        forms = forms.filter((f) => f.status === query.status);
      }
      return reply.status(200).send({ forms: forms.map((f) => f.toJSON()) });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message || "Failed to list forms" });
    }
  });

  // 6. Get Form by ID
  fastify.get("/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    const { tenantId } = getSecurityContext(req);
    const { id } = req.params as { id: string };

    try {
      const formDef = await formDefinitionService.getForm(tenantId, id);
      return reply.status(200).send({ form: formDef.toJSON() });
    } catch (err: any) {
      const status = err.message?.includes("not found") ? 404 : 500;
      return reply.status(status).send({ error: err.message || "Failed to get form" });
    }
  });

  // 7. Save Draft Submission
  fastify.post("/:id/drafts", async (req: FastifyRequest, reply: FastifyReply) => {
    const { tenantId, userId } = getSecurityContext(req);
    const { id: formDefinitionId } = req.params as { id: string };

    const body = req.body as {
      submissionId?: string;
      responses?: Array<{ fieldId: string; value: any }>;
      metadata?: any;
    };

    const subId = body.submissionId || `sub-${Date.now()}`;
    const responses = (body.responses || []).map((r) => new FieldResponse(r));

    try {
      let submission = await submissionService.getSubmission(tenantId, subId);
      if (!submission) {
        submission = await submissionService.createDraft({
          id: subId,
          tenantId,
          formDefinitionId,
          responses,
          metadata: body.metadata ? new SubmissionMetadata(body.metadata) : undefined,
          actorId: userId,
        });
      } else {
        submission = await submissionService.saveDraft({
          id: subId,
          tenantId,
          responses,
          metadataUpdates: body.metadata,
          actorId: userId,
        });
      }

      return reply.status(200).send({ submission: submission.toJSON() });
    } catch (err: any) {
      const status = err.message?.includes("not found") ? 404 : 400;
      return reply.status(status).send({ error: err.message || "Failed to save draft" });
    }
  });

  // 8. Submit Form
  fastify.post("/:id/submissions", async (req: FastifyRequest, reply: FastifyReply) => {
    const { tenantId, userId } = getSecurityContext(req);
    const { id: formDefinitionId } = req.params as { id: string };

    const body = req.body as {
      submissionId?: string;
      responses?: Array<{ fieldId: string; value: any }>;
      metadata?: any;
    };

    const subId = body.submissionId || `sub-${Date.now()}`;
    const responses = (body.responses || []).map((r) => new FieldResponse(r));

    try {
      let submission = await submissionService.getSubmission(tenantId, subId);
      if (!submission) {
        submission = await submissionService.createDraft({
          id: subId,
          tenantId,
          formDefinitionId,
          responses,
          metadata: body.metadata ? new SubmissionMetadata(body.metadata) : undefined,
          actorId: userId,
        });
      }

      const submitted = await submissionService.submitForm({
        id: subId,
        tenantId,
        responses,
        metadataUpdates: body.metadata,
        actorId: userId,
      });

      // Trigger cross-module workflow engine automatically
      let startedWorkflows: any[] = [];
      try {
        startedWorkflows = await getOrchestrator().onFormSubmitted(tenantId, submitted.id, userId);
      } catch {
        // Non-blocking if no workflow is bound or error occurs
      }

      return reply.status(200).send({
        submission: submitted.toJSON(),
        startedWorkflows: startedWorkflows.map((w) => w.toJSON ? w.toJSON() : w),
      });
    } catch (err: any) {
      const status = err.message?.includes("not found") ? 404 : 400;
      return reply.status(status).send({ error: err.message || "Failed to submit form" });
    }
  });

  // 9. Get Submission by ID
  fastify.get("/submissions/:subId", async (req: FastifyRequest, reply: FastifyReply) => {
    const { tenantId } = getSecurityContext(req);
    const { subId } = req.params as { subId: string };

    try {
      const sub = await submissionService.getSubmission(tenantId, subId);
      if (!sub) {
        return reply.status(404).send({ error: `FormSubmission '${subId}' not found` });
      }
      return reply.status(200).send({ submission: sub.toJSON() });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message || "Failed to get submission" });
    }
  });

  // 10. List Submissions for a Form
  fastify.get("/:id/submissions", async (req: FastifyRequest, reply: FastifyReply) => {
    const { tenantId } = getSecurityContext(req);
    const { id: formDefinitionId } = req.params as { id: string };

    try {
      const list = await submissionService.listSubmissions(tenantId, {
        formDefinitionId,
      });
      return reply.status(200).send({ submissions: list.map((s) => s.toJSON()) });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message || "Failed to list submissions" });
    }
  });

  // 11. End-to-End Cross-Module Audit Timeline
  fastify.get("/e2e/timeline", async (req: FastifyRequest, reply: FastifyReply) => {
    const { tenantId } = getSecurityContext(req);
    const query = req.query as {
      submissionId?: string;
      workflowInstanceId?: string;
      ticketId?: string;
    };

    try {
      const timeline = await getOrchestrator().getLifecycleAuditTrail(tenantId, {
        submissionId: query.submissionId,
        workflowInstanceId: query.workflowInstanceId,
        ticketId: query.ticketId,
      });
      return reply.status(200).send({ timeline });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message || "Failed to retrieve E2E timeline" });
    }
  });
}
