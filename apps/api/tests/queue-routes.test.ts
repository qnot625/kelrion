import assert from "node:assert/strict";
import { test } from "node:test";
import { TenantId, BranchId, UserRole } from "@klerion/queue";
import { buildServer } from "../src/server.js";

test("GET /api/queues returns tenant queues and enforces isolation", async () => {
  const server = buildServer();
  const tenantA = TenantId.generate().value;
  const tenantB = TenantId.generate().value;
  const branchId = BranchId.generate().value;

  // 1. Create a queue for Tenant A
  const createRes = await server.inject({
    method: "POST",
    url: "/api/queues",
    headers: {
      "x-tenant-id": tenantA,
      "x-user-id": "owner-1",
      "x-user-role": "OWNER",
    },
    payload: {
      branchId,
      code: "CONSULT",
      name: "Consultation Queue",
      prefix: "CQ",
    },
  });

  assert.equal(createRes.statusCode, 201);
  const createdBody = JSON.parse(createRes.body);
  assert.equal(createdBody.queue.code, "CONSULT");

  // 2. GET queues as Tenant A
  const getResA = await server.inject({
    method: "GET",
    url: "/api/queues",
    headers: {
      "x-tenant-id": tenantA,
      "x-user-id": "member-1",
      "x-user-role": "MEMBER",
    },
  });

  assert.equal(getResA.statusCode, 200);
  const getBodyA = JSON.parse(getResA.body);
  assert.equal(getBodyA.queues.length, 1);
  assert.equal(getBodyA.queues[0].code, "CONSULT");

  // 3. GET queues as Tenant B (Tenant isolation check)
  const getResB = await server.inject({
    method: "GET",
    url: "/api/queues",
    headers: {
      "x-tenant-id": tenantB,
      "x-user-id": "member-2",
      "x-user-role": "MEMBER",
    },
  });

  assert.equal(getResB.statusCode, 200);
  const getBodyB = JSON.parse(getResB.body);
  assert.equal(getBodyB.queues.length, 0);

  await server.close();
});

test("POST /api/queues validates payload and RBAC authorization", async () => {
  const server = buildServer();
  const tenantId = TenantId.generate().value;
  const branchId = BranchId.generate().value;

  // 1. Missing required fields -> 400 Bad Request
  const badRes = await server.inject({
    method: "POST",
    url: "/api/queues",
    headers: {
      "x-tenant-id": tenantId,
      "x-user-id": "owner-1",
      "x-user-role": "OWNER",
    },
    payload: {
      name: "Incomplete Queue",
    },
  });

  assert.equal(badRes.statusCode, 400);
  const badBody = JSON.parse(badRes.body);
  assert.equal(badBody.error, "Bad Request");
  assert.ok(badBody.details.code);

  // 2. Member role cannot create queue -> 401 Unauthorized
  const unauthorizedRes = await server.inject({
    method: "POST",
    url: "/api/queues",
    headers: {
      "x-tenant-id": tenantId,
      "x-user-id": "member-1",
      "x-user-role": "MEMBER",
    },
    payload: {
      branchId,
      code: "VIP",
      name: "VIP Lounge",
      prefix: "V",
    },
  });

  assert.equal(unauthorizedRes.statusCode, 401);

  await server.close();
});

test("GET /api/queues/:id/snapshot returns queue snapshot", async () => {
  const server = buildServer();
  const tenantId = TenantId.generate().value;
  const branchId = BranchId.generate().value;

  // 1. Create a queue
  const createRes = await server.inject({
    method: "POST",
    url: "/api/queues",
    headers: {
      "x-tenant-id": tenantId,
      "x-user-id": "owner-1",
      "x-user-role": "OWNER",
    },
    payload: {
      branchId,
      code: "DENTAL",
      name: "Dental Queue",
      prefix: "D",
    },
  });

  const queue = JSON.parse(createRes.body).queue;

  // 2. Get Snapshot
  const snapshotRes = await server.inject({
    method: "GET",
    url: `/api/queues/${queue.id}/snapshot`,
    headers: {
      "x-tenant-id": tenantId,
      "x-user-id": "member-1",
      "x-user-role": "MEMBER",
    },
  });

  assert.equal(snapshotRes.statusCode, 200);
  const snapshotBody = JSON.parse(snapshotRes.body);
  assert.equal(snapshotBody.snapshot.queueId, queue.id);
  assert.equal(snapshotBody.snapshot.code, "DENTAL");
  assert.equal(snapshotBody.snapshot.waitingCount, 0);

  // 3. Snapshot for non-existent queue -> 404 Not Found
  const notFoundRes = await server.inject({
    method: "GET",
    url: `/api/queues/${TenantId.generate().value}/snapshot`,
    headers: {
      "x-tenant-id": tenantId,
      "x-user-id": "member-1",
      "x-user-role": "MEMBER",
    },
  });

  assert.equal(notFoundRes.statusCode, 404);

  await server.close();
});
