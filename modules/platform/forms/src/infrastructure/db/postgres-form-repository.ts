import { and, desc, eq } from "drizzle-orm";
import { index, integer, jsonb, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import {
  FormDefinition,
  FormSubmission,
  type FormDefinitionRepository,
  type FormFieldProps,
  type FormSubmissionRepository,
  type FieldResponseProps,
  type SubmissionMetadataProps,
  type SubmissionStatus,
} from "../../index.js";
import type { Database } from "@adminops/persistence";
import { tenants } from "@adminops/tenancy";
import { users } from "@adminops/identity";

export const formDefinitions = pgTable(
  "form_definitions",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    status: text("status").notNull(),
    currentVersion: integer("current_version").notNull(),
    fields: jsonb("fields").notNull().default([]),
    locale: text("locale").notNull().default("en"),
    templateKey: text("template_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
  },
  (table) => [
    index("form_definitions_tenant_status_idx").on(table.tenantId, table.status),
    index("form_definitions_tenant_updated_idx").on(table.tenantId, table.updatedAt),
  ],
);

export const formDefinitionVersions = pgTable(
  "form_definition_versions",
  {
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    formDefinitionId: uuid("form_definition_id").notNull().references(() => formDefinitions.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    fields: jsonb("fields").notNull().default([]),
    locale: text("locale").notNull().default("en"),
    templateKey: text("template_key"),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.formDefinitionId, table.version] }),
    index("form_definition_versions_latest_idx").on(table.tenantId, table.formDefinitionId, table.version),
  ],
);

export const formSubmissions = pgTable(
  "form_submissions",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    formDefinitionId: uuid("form_definition_id").notNull().references(() => formDefinitions.id, { onDelete: "cascade" }),
    formVersion: integer("form_version").notNull(),
    submitterUserId: uuid("submitter_user_id").references(() => users.id, { onDelete: "set null" }),
    status: text("status").notNull(),
    responses: jsonb("responses").notNull().default([]),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
  },
  (table) => [
    index("form_submissions_tenant_form_idx").on(table.tenantId, table.formDefinitionId, table.updatedAt),
    index("form_submissions_tenant_submitter_idx").on(table.tenantId, table.submitterUserId, table.updatedAt),
    index("form_submissions_tenant_status_idx").on(table.tenantId, table.status, table.updatedAt),
  ],
);

type DefinitionRow = typeof formDefinitions.$inferSelect;
type VersionRow = typeof formDefinitionVersions.$inferSelect;
type SubmissionRow = typeof formSubmissions.$inferSelect;

function fields(value: unknown): FormFieldProps[] {
  return Array.isArray(value) ? value as FormFieldProps[] : [];
}

function currentDefinition(row: DefinitionRow): FormDefinition {
  return new FormDefinition({
    id: row.id,
    tenantId: row.tenantId,
    title: row.title,
    description: row.description,
    status: row.status as "DRAFT" | "PUBLISHED" | "ARCHIVED",
    version: row.currentVersion,
    fields: fields(row.fields),
    locale: row.locale,
    templateKey: row.templateKey,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    publishedAt: row.publishedAt,
  });
}

function publishedDefinition(row: VersionRow): FormDefinition {
  return new FormDefinition({
    id: row.formDefinitionId,
    tenantId: row.tenantId,
    title: row.title,
    description: row.description,
    status: "PUBLISHED",
    version: row.version,
    fields: fields(row.fields),
    locale: row.locale,
    templateKey: row.templateKey,
    createdAt: row.createdAt,
    updatedAt: row.publishedAt,
    publishedAt: row.publishedAt,
  });
}

function submission(row: SubmissionRow): FormSubmission {
  return new FormSubmission({
    id: row.id,
    tenantId: row.tenantId,
    formDefinitionId: row.formDefinitionId,
    formVersion: row.formVersion,
    status: row.status as SubmissionStatus,
    responses: Array.isArray(row.responses) ? row.responses as FieldResponseProps[] : [],
    metadata: row.metadata as SubmissionMetadataProps,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    submittedAt: row.submittedAt,
  });
}

export class PostgresFormDefinitionRepository implements FormDefinitionRepository {
  constructor(private readonly db: Database) {}

  async findById(tenantId: string, id: string): Promise<FormDefinition | null> {
    const [row] = await this.db.select().from(formDefinitions)
      .where(and(eq(formDefinitions.tenantId, tenantId), eq(formDefinitions.id, id))).limit(1);
    return row ? currentDefinition(row) : null;
  }

  async findByTenant(tenantId: string): Promise<FormDefinition[]> {
    const rows = await this.db.select().from(formDefinitions)
      .where(eq(formDefinitions.tenantId, tenantId)).orderBy(desc(formDefinitions.updatedAt));
    return rows.map(currentDefinition);
  }

  async findPublishedVersion(tenantId: string, id: string, version: number): Promise<FormDefinition | null> {
    const [row] = await this.db.select().from(formDefinitionVersions).where(and(
      eq(formDefinitionVersions.tenantId, tenantId),
      eq(formDefinitionVersions.formDefinitionId, id),
      eq(formDefinitionVersions.version, version),
    )).limit(1);
    return row ? publishedDefinition(row) : null;
  }

  async findLatestPublishedVersion(tenantId: string, id: string): Promise<FormDefinition | null> {
    const [row] = await this.db.select().from(formDefinitionVersions).where(and(
      eq(formDefinitionVersions.tenantId, tenantId),
      eq(formDefinitionVersions.formDefinitionId, id),
    )).orderBy(desc(formDefinitionVersions.version)).limit(1);
    return row ? publishedDefinition(row) : null;
  }

  async listPublishedVersions(tenantId: string, id: string): Promise<FormDefinition[]> {
    const rows = await this.db.select().from(formDefinitionVersions).where(and(
      eq(formDefinitionVersions.tenantId, tenantId),
      eq(formDefinitionVersions.formDefinitionId, id),
    )).orderBy(desc(formDefinitionVersions.version));
    return rows.map(publishedDefinition);
  }

  async save(form: FormDefinition): Promise<void> {
    const data = form.toPersistence();
    await this.db.insert(formDefinitions).values({
      id: form.id,
      tenantId: form.tenantId,
      title: form.title,
      description: form.description,
      status: form.status,
      currentVersion: form.version,
      fields: data.fields as FormFieldProps[],
      locale: form.locale,
      templateKey: form.templateKey,
      createdAt: form.createdAt,
      updatedAt: form.updatedAt,
      publishedAt: form.publishedAt,
    }).onConflictDoUpdate({
      target: formDefinitions.id,
      set: {
        title: form.title,
        description: form.description,
        status: form.status,
        currentVersion: form.version,
        fields: data.fields as FormFieldProps[],
        locale: form.locale,
        templateKey: form.templateKey,
        updatedAt: form.updatedAt,
        publishedAt: form.publishedAt,
      },
    });
  }

  async savePublishedVersion(form: FormDefinition): Promise<void> {
    if (form.status !== "PUBLISHED" || !form.publishedAt) throw new Error("Published form snapshot required");
    const data = form.toPersistence();
    await this.db.insert(formDefinitionVersions).values({
      tenantId: form.tenantId,
      formDefinitionId: form.id,
      version: form.version,
      title: form.title,
      description: form.description,
      fields: data.fields as FormFieldProps[],
      locale: form.locale,
      templateKey: form.templateKey,
      publishedAt: form.publishedAt,
      createdAt: form.createdAt,
    }).onConflictDoUpdate({
      target: [formDefinitionVersions.tenantId, formDefinitionVersions.formDefinitionId, formDefinitionVersions.version],
      set: {
        title: form.title,
        description: form.description,
        fields: data.fields as FormFieldProps[],
        locale: form.locale,
        templateKey: form.templateKey,
        publishedAt: form.publishedAt,
      },
    });
  }
}

export class PostgresFormSubmissionRepository implements FormSubmissionRepository {
  constructor(private readonly db: Database) {}

  async findById(tenantId: string, id: string): Promise<FormSubmission | null> {
    const [row] = await this.db.select().from(formSubmissions)
      .where(and(eq(formSubmissions.tenantId, tenantId), eq(formSubmissions.id, id))).limit(1);
    return row ? submission(row) : null;
  }

  async findByTenant(tenantId: string): Promise<FormSubmission[]> {
    return this.list(and(eq(formSubmissions.tenantId, tenantId)));
  }

  async findByForm(tenantId: string, formDefinitionId: string): Promise<FormSubmission[]> {
    return this.list(and(eq(formSubmissions.tenantId, tenantId), eq(formSubmissions.formDefinitionId, formDefinitionId)));
  }

  async findByOwner(tenantId: string, userId: string): Promise<FormSubmission[]> {
    return this.list(and(eq(formSubmissions.tenantId, tenantId), eq(formSubmissions.submitterUserId, userId)));
  }

  async findByStatus(tenantId: string, status: SubmissionStatus): Promise<FormSubmission[]> {
    return this.list(and(eq(formSubmissions.tenantId, tenantId), eq(formSubmissions.status, status)));
  }

  async save(value: FormSubmission): Promise<void> {
    await this.db.insert(formSubmissions).values({
      id: value.id,
      tenantId: value.tenantId,
      formDefinitionId: value.formDefinitionId,
      formVersion: value.formVersion,
      submitterUserId: value.metadata.submittedByUserId,
      status: value.status,
      responses: value.responses as unknown as FieldResponseProps[],
      metadata: value.metadata as unknown as SubmissionMetadataProps,
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
      submittedAt: value.submittedAt,
    }).onConflictDoUpdate({
      target: formSubmissions.id,
      set: {
        status: value.status,
        responses: value.responses as unknown as FieldResponseProps[],
        metadata: value.metadata as unknown as SubmissionMetadataProps,
        submitterUserId: value.metadata.submittedByUserId,
        updatedAt: value.updatedAt,
        submittedAt: value.submittedAt,
      },
    });
  }

  async deleteDraft(tenantId: string, id: string): Promise<void> {
    await this.db.delete(formSubmissions).where(and(
      eq(formSubmissions.tenantId, tenantId),
      eq(formSubmissions.id, id),
      eq(formSubmissions.status, "DRAFT"),
    ));
  }

  private async list(condition: ReturnType<typeof and>): Promise<FormSubmission[]> {
    const rows = await this.db.select().from(formSubmissions).where(condition).orderBy(desc(formSubmissions.updatedAt));
    return rows.map(submission);
  }
}
