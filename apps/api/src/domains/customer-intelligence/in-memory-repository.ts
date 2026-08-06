import type { CustomerCaseFilters, CustomerIntelligenceRepository } from "./repository.js";
import type { CaseComment, CustomerCase } from "./types.js";

export class InMemoryCustomerIntelligenceRepository implements CustomerIntelligenceRepository {
  private readonly cases = new Map<string, CustomerCase>();
  private readonly comments = new Map<string, CaseComment>();

  async saveCase(customerCase: CustomerCase): Promise<void> {
    this.cases.set(customerCase.id, customerCase);
  }

  async findCase(tenantId: string, id: string): Promise<CustomerCase | undefined> {
    const customerCase = this.cases.get(id);
    return customerCase?.tenantId === tenantId ? customerCase : undefined;
  }

  async listCases(tenantId: string, filters: CustomerCaseFilters = {}): Promise<CustomerCase[]> {
    return [...this.cases.values()]
      .filter((item) => item.tenantId === tenantId)
      .filter((item) => !filters.status || item.status === filters.status)
      .filter((item) => !filters.priority || item.priority === filters.priority)
      .filter((item) => !filters.customerEmail || item.customerEmail === filters.customerEmail.toLowerCase())
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async saveComment(comment: CaseComment): Promise<void> {
    this.comments.set(comment.id, comment);
  }

  async listComments(tenantId: string, caseId: string): Promise<CaseComment[]> {
    return [...this.comments.values()]
      .filter((comment) => comment.tenantId === tenantId && comment.caseId === caseId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }
}
