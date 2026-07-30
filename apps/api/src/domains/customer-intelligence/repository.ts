import type { CaseComment, CasePriority, CaseStatus, CustomerCase } from "./types.js";

export interface CustomerCaseFilters {
  readonly status?: CaseStatus;
  readonly priority?: CasePriority;
  readonly customerEmail?: string;
}

export interface CustomerIntelligenceRepository {
  saveCase(customerCase: CustomerCase): Promise<void>;
  findCase(tenantId: string, id: string): Promise<CustomerCase | undefined>;
  listCases(tenantId: string, filters?: CustomerCaseFilters): Promise<CustomerCase[]>;
  saveComment(comment: CaseComment): Promise<void>;
  listComments(tenantId: string, caseId: string): Promise<CaseComment[]>;
}
