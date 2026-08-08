import type { KlerionSession } from "../../lib/session";

const DEFAULT_API_BASE_URL = "/api";

export type ApiFormFieldType = "text" | "number" | "boolean" | "select" | "multiselect" | "date" | "textarea" | "file" | "signature" | "calculated";
export type ApiFormStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";
export type ApiSubmissionStatus = "DRAFT" | "SUBMITTED" | "VALIDATED" | "ARCHIVED";

export interface ApiValidationRule {
  readonly type: "required" | "min_length" | "max_length" | "min_value" | "max_value" | "regex";
  readonly value?: string | number;
  readonly message: string;
}

export interface ApiVisibilityCondition {
  readonly fieldId: string;
  readonly operator: "equals" | "not_equals" | "contains" | "greater_than" | "less_than";
  readonly value: string | number | boolean;
}

export interface ApiCalculationRule {
  readonly operator: "sum" | "difference" | "product" | "quotient" | "concat";
  readonly fieldIds: readonly string[];
  readonly separator?: string;
}

export interface ApiFormField {
  readonly id: string;
  readonly label: string;
  readonly type: ApiFormFieldType;
  readonly helpText?: string;
  readonly placeholder?: string;
  readonly defaultValue?: unknown;
  readonly options?: readonly { label: string; value: string }[];
  readonly validationRules?: readonly ApiValidationRule[];
  readonly visibilityConditions?: readonly ApiVisibilityCondition[];
  readonly calculation?: ApiCalculationRule | null;
}

export interface ApiFormDefinition {
  readonly id: string;
  readonly tenantId: string;
  readonly title: string;
  readonly description: string;
  readonly status: ApiFormStatus;
  readonly version: number;
  readonly fields: readonly ApiFormField[];
  readonly locale: string;
  readonly templateKey: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly publishedAt: string | null;
}

export interface ApiFieldResponse {
  readonly fieldId: string;
  readonly value: unknown;
}

export interface ApiFormSubmission {
  readonly id: string;
  readonly tenantId: string;
  readonly formDefinitionId: string;
  readonly formVersion: number;
  readonly status: ApiSubmissionStatus;
  readonly responses: readonly ApiFieldResponse[];
  readonly metadata: {
    readonly submittedByUserId: string | null;
    readonly sourceChannel: string;
    readonly locale: string;
    readonly tags: readonly string[];
  };
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly submittedAt: string | null;
}

function baseUrl() {
  const configured = import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL;
  return configured.endsWith("/") ? configured.slice(0, -1) : configured;
}

async function request<T>(session: KlerionSession, path: string, init: RequestInit = {}): Promise<T> {
  if (!session.token) throw new Error("This action requires a live API session.");
  const response = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...init.headers,
      Authorization: `Bearer ${session.token}`,
      "X-Tenant-Slug": session.tenantSlug,
    },
  });
  if (response.status === 204) return undefined as T;
  const body = await response.json().catch(() => null) as { error?: unknown } | T | null;
  if (!response.ok) {
    const message = body && typeof body === "object" && "error" in body && typeof body.error === "string"
      ? body.error
      : `Request failed with status ${response.status}`;
    throw new Error(message);
  }
  return body as T;
}

export const formsApi = {
  listForms(session: KlerionSession): Promise<ApiFormDefinition[]> {
    return request(session, "/forms");
  },
  getForm(session: KlerionSession, id: string, version?: number): Promise<ApiFormDefinition> {
    return request(session, `/forms/${id}${version ? `?version=${version}` : ""}`);
  },
  listVersions(session: KlerionSession, id: string): Promise<ApiFormDefinition[]> {
    return request(session, `/forms/${id}/versions`);
  },
  createForm(session: KlerionSession, input: { title: string; description?: string; fields?: readonly ApiFormField[]; locale?: string; templateKey?: string | null }): Promise<ApiFormDefinition> {
    return request(session, "/forms", { method: "POST", body: JSON.stringify(input) });
  },
  updateForm(session: KlerionSession, id: string, input: { title?: string; description?: string; fields?: readonly ApiFormField[]; locale?: string; templateKey?: string | null }): Promise<ApiFormDefinition> {
    return request(session, `/forms/${id}`, { method: "PATCH", body: JSON.stringify(input) });
  },
  publishForm(session: KlerionSession, id: string): Promise<ApiFormDefinition> {
    return request(session, `/forms/${id}/publish`, { method: "POST" });
  },
  archiveForm(session: KlerionSession, id: string): Promise<ApiFormDefinition> {
    return request(session, `/forms/${id}/archive`, { method: "POST" });
  },
  createDraft(session: KlerionSession, formId: string, responses: readonly ApiFieldResponse[]): Promise<ApiFormSubmission> {
    return request(session, `/forms/${formId}/drafts`, { method: "POST", body: JSON.stringify({ responses }) });
  },
  saveDraft(session: KlerionSession, id: string, responses: readonly ApiFieldResponse[]): Promise<ApiFormSubmission> {
    return request(session, `/form-submissions/${id}`, { method: "PUT", body: JSON.stringify({ responses }) });
  },
  submit(session: KlerionSession, id: string, responses?: readonly ApiFieldResponse[]): Promise<ApiFormSubmission> {
    return request(session, `/form-submissions/${id}/submit`, { method: "POST", body: JSON.stringify(responses ? { responses } : {}) });
  },
  listMySubmissions(session: KlerionSession): Promise<ApiFormSubmission[]> {
    return request(session, "/form-submissions");
  },
  listAllSubmissions(session: KlerionSession, formId?: string): Promise<ApiFormSubmission[]> {
    const query = new URLSearchParams({ scope: "all" });
    if (formId) query.set("formId", formId);
    return request(session, `/form-submissions?${query.toString()}`);
  },
  validateSubmission(session: KlerionSession, id: string): Promise<ApiFormSubmission> {
    return request(session, `/form-submissions/${id}/validate`, { method: "POST" });
  },
};
