import { FormDefinitionService, SubmissionService } from '../../../platform/forms/src/index.js';
import {
  WorkflowDefinitionService,
  WorkflowExecutionService,
  WorkflowStep,
  WorkflowInstance,
} from '../../../platform/workflow/src/index.js';
import { ApprovalService } from '../approval/approval-service.js';
import { WorkflowApprovalAdapter } from '../approval/workflow-approval-integration.js';
import { TicketService } from '../service-desk/ticket-service.js';

export interface AuditEventTimelineItem {
  id: string;
  sourceModule: 'FORMS' | 'WORKFLOW' | 'APPROVAL' | 'SERVICE_DESK';
  eventType: string;
  timestamp: Date;
  actorUserId?: string;
  details: Record<string, any>;
}

export class CrossModuleOrchestrator {
  private readonly approvalAdapter: WorkflowApprovalAdapter;

  constructor(
    private readonly formDefinitionService: FormDefinitionService,
    private readonly submissionService: SubmissionService,
    private readonly workflowDefinitionService: WorkflowDefinitionService,
    private readonly workflowExecutionService: WorkflowExecutionService,
    private readonly approvalService: ApprovalService,
    private readonly ticketService: TicketService
  ) {
    this.approvalAdapter = new WorkflowApprovalAdapter(
      this.approvalService,
      this.workflowExecutionService
    );

    // Wire approval task handler
    this.workflowExecutionService.setApprovalTaskHandler(this.approvalAdapter);

    // Wire approval completion callback back to workflow execution
    this.approvalService.setCompletionCallback(async (approvalReq) => {
      await this.approvalAdapter.onApprovalCompleted(approvalReq);
    });

    // Wire automatic task handler for Service Desk ticket creation
    this.workflowExecutionService.setAutomaticTaskHandler(
      async (step: WorkflowStep, instance: WorkflowInstance, executorId: string) => {
        return this.handleAutomaticStep(step, instance, executorId);
      }
    );
  }

  public getApprovalAdapter(): WorkflowApprovalAdapter {
    return this.approvalAdapter;
  }

  /**
   * Called when a Form is submitted.
   * Auto-starts any PUBLISHED workflow definition that has a FORM_SUBMISSION trigger
   * bound to the submitted formDefinitionId.
   */
  public async onFormSubmitted(
    tenantId: string,
    submissionId: string,
    actorUserId: string
  ): Promise<WorkflowInstance[]> {
    const submission = await this.submissionService.getSubmission(tenantId, submissionId);
    if (!submission) {
      throw new Error(`Submission '${submissionId}' not found for tenant '${tenantId}'`);
    }

    const formDef = await this.formDefinitionService.getForm(tenantId, submission.formDefinitionId);
    const definitions = await this.workflowDefinitionService.listDefinitions(tenantId, {
      status: 'PUBLISHED',
    });

    const matchingWorkflowDefs = definitions.filter((def) => {
      if (!def.triggers || def.triggers.length === 0) return false;
      return def.triggers.some(
        (t) =>
          t.type === 'FORM_SUBMISSION' &&
          (!t.formDefinitionId || t.formDefinitionId === submission.formDefinitionId || t.formDefinitionId === formDef?.id)
      );
    });

    if (matchingWorkflowDefs.length === 0) {
      return [];
    }

    const startedInstances: WorkflowInstance[] = [];

    const responseVariables: Record<string, any> = {
      submissionId: submission.id,
      formDefinitionId: submission.formDefinitionId,
      formTitle: formDef ? formDef.title : 'Form Submission',
      submittedBy: submission.submittedBy || actorUserId,
    };

    for (const res of submission.responses) {
      responseVariables[res.fieldId] = res.value;
    }

    for (const def of matchingWorkflowDefs) {
      const instance = await this.workflowExecutionService.startWorkflow({
        definitionId: def.id,
        version: def.version,
        tenantId,
        startedBy: actorUserId,
        variables: responseVariables,
      });
      startedInstances.push(instance);
    }

    return startedInstances;
  }

  /**
   * Handles automatic workflow steps, e.g. automatic creation of Service Desk Tickets.
   */
  private async handleAutomaticStep(
    step: WorkflowStep,
    instance: WorkflowInstance,
    executorId: string
  ): Promise<Record<string, any> | void> {
    const config = step.config || {};
    const action = config.action || 'DEFAULT';

    if (
      action === 'CREATE_SERVICE_TICKET' ||
      action === 'CREATE_REQUEST' ||
      config.ticketCategory ||
      config.category
    ) {
      const category = (config.ticketCategory || config.category || 'IT') as any;
      const priority = (config.priority || instance.variables.priority || 'MEDIUM') as any;
      const subject =
        config.subject ||
        instance.variables.subject ||
        `Service Desk Request: ${instance.variables.formTitle || step.name}`;
      const description =
        config.description ||
        instance.variables.description ||
        `Auto-generated service ticket from Workflow Instance '${instance.id}' on step '${step.name}'.`;

      const ticket = await this.ticketService.createTicket(instance.tenantId, {
        requesterUserId: instance.startedBy || executorId,
        category,
        title: subject,
        description,
        priority,
        workflowInstanceId: instance.id,
      });

      return {
        serviceTicketId: ticket.id,
        serviceTicketNumber: ticket.ticketNumber,
        serviceTicketStatus: ticket.status,
      };
    }

    return { stepCompleted: true, stepId: step.id };
  }

  /**
   * Aggregates an end-to-end audit trail across Forms, Workflow execution history,
   * Approvals, and Service Desk for a given context.
   */
  public async getLifecycleAuditTrail(
    tenantId: string,
    filter: {
      submissionId?: string;
      workflowInstanceId?: string;
      ticketId?: string;
    }
  ): Promise<AuditEventTimelineItem[]> {
    const timeline: AuditEventTimelineItem[] = [];

    // 1. Form submission audit
    if (filter.submissionId) {
      try {
        const sub = await this.submissionService.getSubmission(tenantId, filter.submissionId);
        if (sub) {
          timeline.push({
            id: `form_sub_${sub.id}`,
            sourceModule: 'FORMS',
            eventType: 'FORM_SUBMITTED',
            timestamp: new Date(sub.submittedAt || Date.now()),
            actorUserId: sub.submittedBy,
            details: { formDefinitionId: sub.formDefinitionId, status: sub.status },
          });
          if (Array.isArray((sub as any).auditTrail)) {
            for (const log of (sub as any).auditTrail) {
              timeline.push({
                id: `form_log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                sourceModule: 'FORMS',
                eventType: log.action || 'FORM_ACTION',
                timestamp: new Date(log.timestamp),
                actorUserId: log.actorUserId,
                details: log.details || {},
              });
            }
          }
        }
      } catch {
        // ignore error fetching submission
      }
    }

    // 2. Workflow instance history
    if (filter.workflowInstanceId) {
      try {
        const instance = await this.workflowExecutionService.getWorkflowInstance(
          filter.workflowInstanceId,
          tenantId
        );
        if (instance) {
          timeline.push({
            id: `wf_inst_${instance.id}`,
            sourceModule: 'WORKFLOW',
            eventType: 'WORKFLOW_EXECUTION',
            timestamp: new Date(instance.updatedAt || Date.now()),
            actorUserId: instance.startedBy,
            details: { status: instance.status, currentStepIndex: instance.currentStepIndex },
          });
        }
      } catch {
        // ignore error fetching workflow instance
      }
    }

    // 3. Approval Request audit
    if (filter.workflowInstanceId) {
      try {
        const approvalRequests = await this.approvalService.listApprovalRequests(tenantId, {
          workflowInstanceId: filter.workflowInstanceId,
        });
        for (const req of approvalRequests) {
          timeline.push({
            id: `approval_${req.id}`,
            sourceModule: 'APPROVAL',
            eventType: `APPROVAL_${req.status}`,
            timestamp: new Date(req.updatedAt || Date.now()),
            actorUserId: req.requesterUserId,
            details: { title: req.title, status: req.status },
          });
        }
      } catch {
        // ignore error fetching approval requests
      }
    }

    // 4. Service Desk ticket logs
    if (filter.ticketId) {
      try {
        const ticket = await this.ticketService.getTicket(tenantId, filter.ticketId);
        if (ticket) {
          timeline.push({
            id: `ticket_${ticket.id}`,
            sourceModule: 'SERVICE_DESK',
            eventType: `TICKET_${ticket.status}`,
            timestamp: new Date(ticket.updatedAt || Date.now()),
            actorUserId: ticket.requesterUserId,
            details: { title: ticket.title, status: ticket.status, category: ticket.category },
          });
          if (Array.isArray(ticket.timeline)) {
            for (const log of ticket.timeline) {
              timeline.push({
                id: log.id || `tck_log_${Math.random().toString(36).substring(2, 6)}`,
                sourceModule: 'SERVICE_DESK',
                eventType: log.type || 'TICKET_UPDATE',
                timestamp: new Date(log.timestamp),
                actorUserId: log.actorUserId,
                details: log.data || {},
              });
            }
          }
        }
      } catch {
        // ignore error fetching ticket
      }
    }

    timeline.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    return timeline;
  }
}
