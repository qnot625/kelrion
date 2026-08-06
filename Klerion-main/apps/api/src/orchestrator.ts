import { CrossModuleOrchestrator } from "../../../modules/domains/internal-services/src/index.js";
import { formDefinitionService, submissionService } from "./routes/forms.js";
import { workflowDefinitionService, workflowExecutionService } from "./routes/workflows.js";
import { approvalService } from "./routes/approvals.js";
import { ticketService } from "./routes/requests.js";

let orchestratorInstance: CrossModuleOrchestrator | null = null;

export function getOrchestrator(): CrossModuleOrchestrator {
  if (!orchestratorInstance) {
    orchestratorInstance = new CrossModuleOrchestrator(
      formDefinitionService,
      submissionService,
      workflowDefinitionService,
      workflowExecutionService,
      approvalService,
      ticketService
    );
  }
  return orchestratorInstance;
}

