import assert from "node:assert/strict";
import { test } from "node:test";
import { TenantId } from "@klerion/notifications";
import { buildServer } from "../src/server.js";

test("Notification API Routes Integration", async (t) => {
  await t.test("POST /api/notifications/test sends email notification successfully", async () => {
    const server = buildServer();
    const tenantId = TenantId.generate().value;

    const res = await server.inject({
      method: "POST",
      url: "/api/notifications/test",
      headers: {
        "x-tenant-id": tenantId,
        "x-user-id": "usr_admin",
        "x-user-role": "STAFF",
      },
      payload: {
        recipient: "user@example.com",
        channel: "email",
        variables: { name: "Alice" },
      },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.success, true);
    assert.equal(body.status, "sent");
    assert.equal(body.recipient, "user@example.com");
    assert.ok(body.notificationId);
  });

  await t.test("POST /api/notifications/test sends SMS notification successfully", async () => {
    const server = buildServer();
    const tenantId = TenantId.generate().value;

    const res = await server.inject({
      method: "POST",
      url: "/api/notifications/test",
      headers: {
        "x-tenant-id": tenantId,
        "x-user-id": "usr_admin",
        "x-user-role": "STAFF",
      },
      payload: {
        recipient: "+15559876543",
        channel: "sms",
        variables: { name: "Bob" },
      },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.success, true);
    assert.equal(body.status, "sent");
    assert.equal(body.channel, "sms");
  });

  await t.test("GET /api/notifications returns tenant notification history", async () => {
    const server = buildServer();
    const tenantId = TenantId.generate().value;

    // Send a test notification first
    await server.inject({
      method: "POST",
      url: "/api/notifications/test",
      headers: {
        "x-tenant-id": tenantId,
        "x-user-id": "usr_admin",
        "x-user-role": "STAFF",
      },
      payload: {
        recipient: "history@example.com",
        channel: "email",
      },
    });

    // Query notifications history for tenant
    const res = await server.inject({
      method: "GET",
      url: "/api/notifications",
      headers: {
        "x-tenant-id": tenantId,
        "x-user-id": "usr_admin",
        "x-user-role": "STAFF",
      },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.ok(Array.isArray(body.data));
    assert.equal(body.data.length, 1);
    assert.equal(body.data[0].recipient, "history@example.com");
    assert.equal(body.pagination.total, 1);
  });

  await t.test("POST /api/notifications/test rejects invalid recipient", async () => {
    const server = buildServer();
    const tenantId = TenantId.generate().value;

    const res = await server.inject({
      method: "POST",
      url: "/api/notifications/test",
      headers: {
        "x-tenant-id": tenantId,
      },
      payload: {
        recipient: "",
        channel: "email",
      },
    });

    assert.equal(res.statusCode, 400);
  });

  await t.test("Enforces tenant isolation between separate tenants", async () => {
    const server = buildServer();
    const tenantA = TenantId.generate().value;
    const tenantB = TenantId.generate().value;

    // Send for tenant A
    await server.inject({
      method: "POST",
      url: "/api/notifications/test",
      headers: { "x-tenant-id": tenantA },
      payload: { recipient: "tenantA@example.com", channel: "email" },
    });

    // Query for tenant B
    const resB = await server.inject({
      method: "GET",
      url: "/api/notifications",
      headers: { "x-tenant-id": tenantB },
    });

    assert.equal(resB.statusCode, 200);
    const bodyB = JSON.parse(resB.body);
    assert.equal(bodyB.data.length, 0);
    assert.equal(bodyB.pagination.total, 0);
  });
});
