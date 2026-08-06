export interface FormFieldOptionJSON {
  readonly label: string;
  readonly value: string;
}

export interface ValidationRuleJSON {
  readonly type: string;
  readonly value?: any;
  readonly message?: string;
}

export interface VisibilityConditionJSON {
  readonly fieldId: string;
  readonly operator: string;
  readonly value: any;
}

export interface FormFieldJSON {
  readonly id: string;
  readonly label: string;
  readonly type: "text" | "number" | "boolean" | "select" | "multiselect" | "date";
  readonly placeholder?: string;
  readonly helpText?: string;
  readonly defaultValue?: any;
  readonly options?: readonly FormFieldOptionJSON[];
  readonly validationRules?: readonly ValidationRuleJSON[];
  readonly visibilityConditions?: readonly VisibilityConditionJSON[];
}

export interface FormDefinitionJSON {
  readonly id: string;
  readonly tenantId: string;
  readonly title: string;
  readonly description?: string;
  readonly status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  readonly version: number;
  readonly fields: readonly FormFieldJSON[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface FieldResponseJSON {
  readonly fieldId: string;
  readonly value: any;
}

export interface SubmissionMetadataJSON {
  readonly ipAddress?: string;
  readonly userAgent?: string;
  readonly submittedByUserId?: string;
  readonly sourceChannel?: string;
  readonly tags?: readonly string[];
}

export interface FormSubmissionJSON {
  readonly id: string;
  readonly tenantId: string;
  readonly formDefinitionId: string;
  readonly formVersion: number;
  readonly status: "DRAFT" | "SUBMITTED" | "VALIDATED" | "ARCHIVED";
  readonly responses: readonly FieldResponseJSON[];
  readonly metadata: SubmissionMetadataJSON;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly submittedAt?: string | null;
}

const DEFAULT_HEADERS = {
  "Content-Type": "application/json",
  "x-tenant-id": "tenant-default",
  "x-user-id": "user-1",
  "x-user-role": "admin",
};

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = `HTTP ${res.status} ${res.statusText}`;
    try {
      const errJson = await res.json();
      if (errJson.error) msg = errJson.error;
    } catch {
      // Ignore JSON parse error
    }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export const formsApi = {
  async listForms(headers?: Record<string, string>): Promise<FormDefinitionJSON[]> {
    const res = await fetch("/api/forms", {
      headers: { ...DEFAULT_HEADERS, ...headers },
    });
    const data = await handleResponse<{ forms: FormDefinitionJSON[] }>(res);
    return data.forms;
  },

  async getForm(id: string, headers?: Record<string, string>): Promise<FormDefinitionJSON> {
    const res = await fetch(`/api/forms/${encodeURIComponent(id)}`, {
      headers: { ...DEFAULT_HEADERS, ...headers },
    });
    const data = await handleResponse<{ form: FormDefinitionJSON }>(res);
    return data.form;
  },

  async createForm(data: Partial<FormDefinitionJSON>, headers?: Record<string, string>): Promise<FormDefinitionJSON> {
    const res = await fetch("/api/forms", {
      method: "POST",
      headers: { ...DEFAULT_HEADERS, ...headers },
      body: JSON.stringify(data),
    });
    const result = await handleResponse<{ form: FormDefinitionJSON }>(res);
    return result.form;
  },

  async updateForm(id: string, data: Partial<FormDefinitionJSON>, headers?: Record<string, string>): Promise<FormDefinitionJSON> {
    const res = await fetch(`/api/forms/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { ...DEFAULT_HEADERS, ...headers },
      body: JSON.stringify(data),
    });
    const result = await handleResponse<{ form: FormDefinitionJSON }>(res);
    return result.form;
  },

  async publishForm(id: string, headers?: Record<string, string>): Promise<FormDefinitionJSON> {
    const res = await fetch(`/api/forms/${encodeURIComponent(id)}/publish`, {
      method: "POST",
      headers: { ...DEFAULT_HEADERS, ...headers },
    });
    const result = await handleResponse<{ form: FormDefinitionJSON }>(res);
    return result.form;
  },

  async archiveForm(id: string, headers?: Record<string, string>): Promise<FormDefinitionJSON> {
    const res = await fetch(`/api/forms/${encodeURIComponent(id)}/archive`, {
      method: "POST",
      headers: { ...DEFAULT_HEADERS, ...headers },
    });
    const result = await handleResponse<{ form: FormDefinitionJSON }>(res);
    return result.form;
  },

  async saveSubmissionDraft(
    formId: string,
    payload: { submissionId?: string; responses: FieldResponseJSON[]; metadata?: any },
    headers?: Record<string, string>,
  ): Promise<FormSubmissionJSON> {
    const res = await fetch(`/api/forms/${encodeURIComponent(formId)}/drafts`, {
      method: "POST",
      headers: { ...DEFAULT_HEADERS, ...headers },
      body: JSON.stringify(payload),
    });
    const result = await handleResponse<{ submission: FormSubmissionJSON }>(res);
    return result.submission;
  },

  async submitForm(
    formId: string,
    payload: { submissionId?: string; responses?: FieldResponseJSON[]; metadata?: any },
    headers?: Record<string, string>,
  ): Promise<FormSubmissionJSON> {
    const res = await fetch(`/api/forms/${encodeURIComponent(formId)}/submissions`, {
      method: "POST",
      headers: { ...DEFAULT_HEADERS, ...headers },
      body: JSON.stringify(payload),
    });
    const result = await handleResponse<{ submission: FormSubmissionJSON }>(res);
    return result.submission;
  },

  async getSubmission(subId: string, headers?: Record<string, string>): Promise<FormSubmissionJSON> {
    const res = await fetch(`/api/forms/submissions/${encodeURIComponent(subId)}`, {
      headers: { ...DEFAULT_HEADERS, ...headers },
    });
    const data = await handleResponse<{ submission: FormSubmissionJSON }>(res);
    return data.submission;
  },

  async listSubmissions(formId: string, headers?: Record<string, string>): Promise<FormSubmissionJSON[]> {
    const res = await fetch(`/api/forms/${encodeURIComponent(formId)}/submissions`, {
      headers: { ...DEFAULT_HEADERS, ...headers },
    });
    const data = await handleResponse<{ submissions: FormSubmissionJSON[] }>(res);
    return data.submissions;
  },
};
