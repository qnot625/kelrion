import type { ApprovalPolicy } from "./policy.js";
import type { ApprovalRequest } from "./request.js";
import type { ApprovalRequestStatus, ApprovalSourceType } from "./types.js";

export interface ApprovalPolicyRepository {
  findById(tenantId: string, id: string): Promise<ApprovalPolicy | null>;
  listByTenant(tenantId: string): Promise<ApprovalPolicy[]>;
  findPublishedVersion(tenantId: string, id: string, version: number): Promise<ApprovalPolicy | null>;
  findLatestPublishedVersion(tenantId: string, id: string): Promise<ApprovalPolicy | null>;
  listPublishedVersions(tenantId: string, id: string): Promise<ApprovalPolicy[]>;
  save(policy: ApprovalPolicy): Promise<void>;
  savePublishedVersion(policy: ApprovalPolicy): Promise<void>;
}

export interface ApprovalRequestRepository {
  findById(tenantId: string, id: string): Promise<ApprovalRequest | null>;
  listByTenant(tenantId: string, status?: ApprovalRequestStatus): Promise<ApprovalRequest[]>;
  listByRequester(tenantId: string, userId: string): Promise<ApprovalRequest[]>;
  findBySource(tenantId: string, sourceType: ApprovalSourceType, sourceReferenceId: string): Promise<ApprovalRequest[]>;
  save(request: ApprovalRequest): Promise<void>;
}
