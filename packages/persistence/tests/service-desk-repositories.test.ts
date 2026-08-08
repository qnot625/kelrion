import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { ServiceDeskCatalogService, ServiceDeskService } from "@adminops/service-desk";
import {
  PostgresServiceDeskCatalogRepository,
  PostgresServiceDeskSlaPolicyRepository,
  PostgresServiceDeskTicketRepository,
  PostgresTenantRepository,
  runMigrations,
  schema,
  type Database,
} from "../src/index.js";

async function database(): Promise<Database> {
  const db = drizzle(new PGlite(), { schema }) as unknown as Database;
  await runMigrations(db);
  await runMigrations(db);
  return db;
}

test("Postgres Service Desk catalogue preserves immutable published versions", async () => {
  const db = await database();
  const tenants = new PostgresTenantRepository(db);
  const tenant = await tenants.create({ name: "Catalogue DB", slug: "service-catalogue-db" });
  const repository = new PostgresServiceDeskCatalogRepository(db);
  const service = new ServiceDeskCatalogService(repository);
  const actor = crypto.randomUUID();

  const item = await service.create({
    tenantId: tenant.id,
    actorUserId: actor,
    key: "laptop-request",
    name: "Laptop request",
    intakeMode: "FORM",
    formDefinitionId: crypto.randomUUID(),
    workflowDefinitionId: crypto.randomUUID(),
    approvalPolicyId: crypto.randomUUID(),
    defaultPriority: "MEDIUM",
    assignmentGroupId: "it",
  });
  await service.publish(tenant.id, item.id, actor);
  const revised = await service.update({ tenantId: tenant.id, id: item.id, actorUserId: actor, name: "Computer request", defaultPriority: "HIGH" });
  assert.equal(revised.version, 2);
  await service.publish(tenant.id, item.id, actor);

  assert.deepEqual((await repository.listPublishedVersions(tenant.id, item.id)).map((version) => version.version), [2, 1]);
  assert.equal((await repository.findPublishedVersion(tenant.id, item.id, 1))?.name, "Laptop request");
  assert.equal((await repository.findLatestPublishedVersion(tenant.id, item.id))?.name, "Computer request");
  assert.equal(await repository.findById("00000000-0000-0000-0000-000000000000", item.id), null);
  await runMigrations(db);
  assert.equal((await repository.findPublishedVersion(tenant.id, item.id, 1))?.defaultPriority, "MEDIUM");
});

test("Postgres service desk repositories preserve SLA, comments and status history", async () => {
  const db = await database();
  const tenants = new PostgresTenantRepository(db);
  const tickets = new PostgresServiceDeskTicketRepository(db);
  const slas = new PostgresServiceDeskSlaPolicyRepository(db);
  const service = new ServiceDeskService(tickets, slas);
  const tenant = await tenants.create({ name: "Service Desk DB", slug: "service-desk-db" });
  const actor = "00000000-0000-4000-8000-000000000001";

  const sla = await service.createSlaPolicy({ tenantId: tenant.id, actorUserId: actor, name: "Urgent incident", ticketTypes: ["INCIDENT"], priorities: ["URGENT"], firstResponseMinutes: 15, resolutionMinutes: 120 });
  const ticket = await service.createTicket({ tenantId: tenant.id, actorUserId: actor, type: "INCIDENT", priority: "URGENT", subject: "Network outage", description: "HQ is offline" });
  assert.equal(ticket.slaPolicyId, sla.id);
  await service.assignTicket({ tenantId: tenant.id, id: ticket.id, actorUserId: actor, assigneeUserId: "00000000-0000-4000-8000-000000000002", assignmentGroupId: "network" });
  await service.addComment({ tenantId: tenant.id, id: ticket.id, actorUserId: "00000000-0000-4000-8000-000000000002", canManage: true, visibility: "REQUESTER", body: "Investigating upstream connectivity" });
  await service.transitionTicket({ tenantId: tenant.id, id: ticket.id, actorUserId: "00000000-0000-4000-8000-000000000002", toStatus: "IN_PROGRESS", reason: "Engineer assigned" });
  await service.transitionTicket({ tenantId: tenant.id, id: ticket.id, actorUserId: "00000000-0000-4000-8000-000000000002", toStatus: "RESOLVED", reason: "Provider route restored" });

  const stored = await tickets.findById(tenant.id, ticket.id);
  assert.equal(stored?.status, "RESOLVED");
  assert.equal(stored?.assigneeUserId, "00000000-0000-4000-8000-000000000002");
  assert.equal(stored?.comments.length, 1);
  assert.equal(stored?.toPersistence().statusHistory.length, 3);
  assert.ok(stored?.firstRespondedAt);
  assert.equal(await tickets.findById("00000000-0000-0000-0000-000000000000", ticket.id), null);
  await runMigrations(db);
});
