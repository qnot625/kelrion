import assert from "node:assert/strict";
import { test } from "node:test";
import {
  InMemoryServiceDeskCatalogRepository,
  InMemoryServiceDeskSlaPolicyRepository,
  InMemoryServiceDeskTicketRepository,
  ServiceDeskAccessError,
  ServiceDeskCatalogService,
  ServiceDeskService,
  ServiceDeskTicket,
} from "../src/index.js";

function setup() {
  const tickets = new InMemoryServiceDeskTicketRepository();
  const slas = new InMemoryServiceDeskSlaPolicyRepository();
  return { tickets, slas, service: new ServiceDeskService(tickets, slas) };
}

test("catalogue versions are immutable and form intake requires a form", async () => {
  const repository = new InMemoryServiceDeskCatalogRepository();
  const service = new ServiceDeskCatalogService(repository);
  const actor = "owner-a";
  const invalid = await service.create({ tenantId: "tenant-a", actorUserId: actor, key: "invalid", name: "Invalid", intakeMode: "FORM" });
  await assert.rejects(() => service.publish("tenant-a", invalid.id, actor), /formDefinitionId/);

  const item = await service.create({ tenantId: "tenant-a", actorUserId: actor, key: "equipment-request", name: "Equipment request", intakeMode: "FORM", formDefinitionId: "form-a", defaultPriority: "MEDIUM" });
  await service.publish("tenant-a", item.id, actor);
  const revised = await service.update({ tenantId: "tenant-a", id: item.id, actorUserId: actor, name: "IT equipment request", defaultPriority: "HIGH" });
  assert.equal(revised.version, 2);
  await service.publish("tenant-a", item.id, actor);
  assert.equal((await repository.findPublishedVersion("tenant-a", item.id, 1))?.name, "Equipment request");
  assert.equal((await repository.findPublishedVersion("tenant-a", item.id, 1))?.defaultPriority, "MEDIUM");
  assert.equal((await repository.findPublishedVersion("tenant-a", item.id, 2))?.defaultPriority, "HIGH");
});

test("catalogue keys are unique per tenant and tenant isolated", async () => {
  const repository = new InMemoryServiceDeskCatalogRepository();
  const service = new ServiceDeskCatalogService(repository);
  await service.create({ tenantId: "tenant-a", actorUserId: "owner", key: "leave-letter", name: "Leave letter" });
  await assert.rejects(() => service.create({ tenantId: "tenant-a", actorUserId: "owner", key: "leave-letter", name: "Duplicate" }), /already exists/);
  const beta = await service.create({ tenantId: "tenant-b", actorUserId: "owner", key: "leave-letter", name: "Beta leave letter" });
  assert.equal((await repository.findById("tenant-a", beta.id)), null);
});

test("most specific matching SLA policy is applied to a new ticket", async () => {
  const { service } = setup();
  const actor = "00000000-0000-4000-8000-000000000001";
  await service.createSlaPolicy({ tenantId: "tenant-a", actorUserId: actor, name: "Default", firstResponseMinutes: 240, resolutionMinutes: 1440 });
  const urgent = await service.createSlaPolicy({ tenantId: "tenant-a", actorUserId: actor, name: "Urgent IT", ticketTypes: ["INCIDENT"], priorities: ["URGENT"], categoryKeys: ["it"], firstResponseMinutes: 15, resolutionMinutes: 120 });
  const ticket = await service.createTicket({ tenantId: "tenant-a", actorUserId: actor, type: "INCIDENT", priority: "URGENT", categoryKey: "it", subject: "VPN outage" });
  assert.equal(ticket.slaPolicyId, urgent.id);
  assert.ok(ticket.firstResponseDueAt);
  assert.ok(ticket.resolutionDueAt);
});

test("requester-visible manager reply records first response while internal notes do not", async () => {
  const { service } = setup();
  const requester = "00000000-0000-4000-8000-000000000010";
  const manager = "00000000-0000-4000-8000-000000000020";
  const ticket = await service.createTicket({ tenantId: "tenant-a", actorUserId: requester, type: "SERVICE_REQUEST", subject: "Need software access" });
  await service.addComment({ tenantId: "tenant-a", id: ticket.id, actorUserId: manager, canManage: true, visibility: "INTERNAL", body: "Checking licensing" });
  assert.equal((await service.getTicket({ tenantId: "tenant-a", id: ticket.id, actorUserId: manager, canManage: true })).firstRespondedAt, null);
  await service.addComment({ tenantId: "tenant-a", id: ticket.id, actorUserId: manager, canManage: true, visibility: "REQUESTER", body: "We are working on it" });
  assert.ok((await service.getTicket({ tenantId: "tenant-a", id: ticket.id, actorUserId: manager, canManage: true })).firstRespondedAt);
});

test("requester cannot add internal notes or view unrelated tickets", async () => {
  const { service } = setup();
  const owner = "00000000-0000-4000-8000-000000000001";
  const member = "00000000-0000-4000-8000-000000000002";
  const stranger = "00000000-0000-4000-8000-000000000003";
  const ticket = await service.createTicket({ tenantId: "tenant-a", actorUserId: member, type: "INCIDENT", subject: "Printer offline" });
  await assert.rejects(() => service.addComment({ tenantId: "tenant-a", id: ticket.id, actorUserId: member, canManage: false, visibility: "INTERNAL", body: "Private" }), ServiceDeskAccessError);
  await assert.rejects(() => service.getTicket({ tenantId: "tenant-a", id: ticket.id, actorUserId: stranger, canManage: false }), ServiceDeskAccessError);
  assert.equal((await service.getTicket({ tenantId: "tenant-a", id: ticket.id, actorUserId: owner, canManage: true })).id, ticket.id);
});

test("leaving a paused SLA status extends unresolved deadlines by the pause duration", () => {
  const now = Date.now();
  const ticket = new ServiceDeskTicket({
    id: "ticket-a",
    tenantId: "tenant-a",
    reference: "SD-TICKETA",
    type: "INCIDENT",
    priority: "HIGH",
    status: "PENDING_REQUESTER",
    subject: "Need information",
    description: "",
    categoryKey: null,
    requester: { userId: "member-a" },
    source: "WEB",
    assignmentGroupId: null,
    assigneeUserId: null,
    watcherUserIds: [],
    tags: [],
    workflowInstanceId: null,
    approvalRequestId: null,
    slaPolicyId: "sla-a",
    firstResponseDueAt: new Date(now + 30_000),
    resolutionDueAt: new Date(now + 60_000),
    firstRespondedAt: null,
    resolvedAt: null,
    closedAt: null,
    cancelledAt: null,
    pausedAt: new Date(now - 20_000),
    accumulatedPausedMs: 0,
    escalationLevel: 0,
    comments: [],
    statusHistory: [],
    createdByUserId: "member-a",
    createdAt: new Date(now - 40_000),
    updatedAt: new Date(now - 20_000),
  });
  const before = ticket.resolutionDueAt!.getTime();
  ticket.transition({
    toStatus: "IN_PROGRESS",
    actorUserId: "staff-a",
    eventId: "event-a",
    slaPolicy: {
      id: "sla-a",
      tenantId: "tenant-a",
      name: "SLA",
      description: "",
      enabled: true,
      ticketTypes: [],
      priorities: [],
      categoryKeys: [],
      firstResponseMinutes: 1,
      resolutionMinutes: 2,
      pauseStatuses: ["PENDING_REQUESTER"],
      escalationThresholds: [80, 100],
      createdAt: new Date(now - 100_000),
      updatedAt: new Date(now - 100_000),
    },
  });
  assert.ok(ticket.resolutionDueAt!.getTime() >= before + 19_000);
});

test("cancelled tickets are terminal", async () => {
  const { service } = setup();
  const actor = "00000000-0000-4000-8000-000000000001";
  const ticket = await service.createTicket({ tenantId: "tenant-a", actorUserId: actor, type: "PROBLEM", subject: "Duplicate issue" });
  await service.transitionTicket({ tenantId: "tenant-a", id: ticket.id, actorUserId: actor, toStatus: "CANCELLED", reason: "Duplicate" });
  await assert.rejects(() => service.addComment({ tenantId: "tenant-a", id: ticket.id, actorUserId: actor, canManage: true, visibility: "INTERNAL", body: "No more work" }), /Cancelled tickets/);
});
