import { and, asc, desc, eq, type SQL } from "drizzle-orm";
import type { Database } from "@adminops/persistence";
import { caseComments, customerCases } from "./postgres-schema.js";
import type { CustomerCaseFilters, CustomerIntelligenceRepository } from "./repository.js";
import type {
  CaseComment,
  CaseCommentVisibility,
  CasePriority,
  CaseStatus,
  CustomerCase,
} from "./types.js";

type CaseRow = typeof customerCases.$inferSelect;
type CommentRow = typeof caseComments.$inferSelect;

function toCase(row: CaseRow): CustomerCase {
  return {
    id: row.id,
    tenantId: row.tenantId,
    reference: row.reference,
    customerEmail: row.customerEmail,
    subject: row.subject,
    description: row.description,
    category: row.category,
    priority: row.priority as CasePriority,
    status: row.status as CaseStatus,
    ownerUserId: row.ownerUserId,
    slaDueAt: row.slaDueAt,
    firstResponseAt: row.firstResponseAt,
    resolvedAt: row.resolvedAt,
    resolution: row.resolution,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toComment(row: CommentRow): CaseComment {
  return {
    id: row.id,
    tenantId: row.tenantId,
    caseId: row.caseId,
    authorUserId: row.authorUserId,
    body: row.body,
    visibility: row.visibility as CaseCommentVisibility,
    createdAt: row.createdAt,
  };
}

export class PostgresCustomerIntelligenceRepository implements CustomerIntelligenceRepository {
  constructor(private readonly db: Database) {}

  async saveCase(customerCase: CustomerCase): Promise<void> {
    await this.db.insert(customerCases).values({
      id: customerCase.id,
      tenantId: customerCase.tenantId,
      reference: customerCase.reference,
      customerEmail: customerCase.customerEmail,
      subject: customerCase.subject,
      description: customerCase.description,
      category: customerCase.category,
      priority: customerCase.priority,
      status: customerCase.status,
      ownerUserId: customerCase.ownerUserId,
      slaDueAt: customerCase.slaDueAt,
      firstResponseAt: customerCase.firstResponseAt,
      resolvedAt: customerCase.resolvedAt,
      resolution: customerCase.resolution,
      createdByUserId: customerCase.createdByUserId,
      createdAt: customerCase.createdAt,
      updatedAt: customerCase.updatedAt,
    }).onConflictDoUpdate({
      target: customerCases.id,
      set: {
        subject: customerCase.subject,
        description: customerCase.description,
        category: customerCase.category,
        priority: customerCase.priority,
        status: customerCase.status,
        ownerUserId: customerCase.ownerUserId,
        slaDueAt: customerCase.slaDueAt,
        firstResponseAt: customerCase.firstResponseAt,
        resolvedAt: customerCase.resolvedAt,
        resolution: customerCase.resolution,
        updatedAt: customerCase.updatedAt,
      },
    });
  }

  async findCase(tenantId: string, id: string): Promise<CustomerCase | undefined> {
    const [row] = await this.db.select().from(customerCases)
      .where(and(eq(customerCases.tenantId, tenantId), eq(customerCases.id, id))).limit(1);
    return row ? toCase(row) : undefined;
  }

  async listCases(tenantId: string, filters: CustomerCaseFilters = {}): Promise<CustomerCase[]> {
    const conditions: SQL[] = [eq(customerCases.tenantId, tenantId)];
    if (filters.status) conditions.push(eq(customerCases.status, filters.status));
    if (filters.priority) conditions.push(eq(customerCases.priority, filters.priority));
    if (filters.customerEmail) conditions.push(eq(customerCases.customerEmail, filters.customerEmail.toLowerCase()));
    const rows = await this.db.select().from(customerCases)
      .where(and(...conditions)).orderBy(desc(customerCases.createdAt));
    return rows.map(toCase);
  }

  async saveComment(comment: CaseComment): Promise<void> {
    await this.db.insert(caseComments).values({
      id: comment.id,
      tenantId: comment.tenantId,
      caseId: comment.caseId,
      authorUserId: comment.authorUserId,
      body: comment.body,
      visibility: comment.visibility,
      createdAt: comment.createdAt,
    });
  }

  async listComments(tenantId: string, caseId: string): Promise<CaseComment[]> {
    const rows = await this.db.select().from(caseComments)
      .where(and(eq(caseComments.tenantId, tenantId), eq(caseComments.caseId, caseId)))
      .orderBy(asc(caseComments.createdAt));
    return rows.map(toComment);
  }
}
