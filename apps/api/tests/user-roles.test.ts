import assert from "node:assert/strict";
import { test } from "node:test";
import { createAppContext } from "../src/context.js";
import { buildServer } from "../src/server.js";

type Server = ReturnType<typeof buildServer>;

async function createTenant(app: Server, name: string, slug: string) {
  const response = await app.inject({ method: "POST", url: "/tenants", payload: { name, slug } });
  assert.equal(response.statusCode, 201, response.body);
}

async function signUp(app: Server, slug: string, email: string, password = "correct-horse") {
  const response = await app.inject({
    method: "POST",
    url: "/auth/signup",
    headers: { "x-tenant-slug": slug },
    payload: { email, password },
  });
  assert.equal(response.statusCode, 201, response.body);
  return response.json() as { userId: string; token: string };
}

function auth(slug: string, token: string) {
  return { "x-tenant-slug": slug, authorization: `Bearer ${token}` };
}

/** Tenant with an owner and one ordinary member. */
async function tenantWithMember(slug = "acme-clinics") {
  const app = buildServer(createAppContext());
  await createTenant(app, "Acme Clinics", slug);
  const owner = await signUp(app, slug, "owner@acme.com");
  const member = await signUp(app, slug, "member@acme.com", "another-pass");
  return { app, owner, member, slug };
}

test("an owner can list the users in their tenant, without password hashes", async () => {
  const { app, owner, slug } = await tenantWithMember();

  const response = await app.inject({ method: "GET", url: "/users", headers: auth(slug, owner.token) });
  assert.equal(response.statusCode, 200, response.body);

  const users = response.json() as { id: string; email: string; roles: string[] }[];
  assert.equal(users.length, 2);
  assert.deepEqual(
    users.map((user) => user.email).sort(),
    ["member@acme.com", "owner@acme.com"],
  );
  for (const user of users) {
    assert.ok(!("passwordHash" in user), "password hash must never be exposed");
  }
});

test("a member cannot list users or change roles", async () => {
  const { app, member, owner, slug } = await tenantWithMember();

  const list = await app.inject({ method: "GET", url: "/users", headers: auth(slug, member.token) });
  assert.equal(list.statusCode, 403);

  const patch = await app.inject({
    method: "PATCH",
    url: `/users/${owner.userId}/roles`,
    headers: auth(slug, member.token),
    payload: { roles: ["member"] },
  });
  assert.equal(patch.statusCode, 403);
});

test("an owner can promote a member to staff, and the change takes effect", async () => {
  const { app, owner, member, slug } = await tenantWithMember();

  const patch = await app.inject({
    method: "PATCH",
    url: `/users/${member.userId}/roles`,
    headers: auth(slug, owner.token),
    payload: { roles: ["staff"] },
  });
  assert.equal(patch.statusCode, 200, patch.body);
  assert.deepEqual((patch.json() as { roles: string[] }).roles, ["staff"]);

  // The member's existing token still carries the old claims, so re-login to
  // pick up the new role, then confirm staff can now manage appointments.
  const login = await app.inject({
    method: "POST",
    url: "/auth/login",
    headers: { "x-tenant-slug": slug },
    payload: { email: "member@acme.com", password: "another-pass" },
  });
  const promoted = login.json() as { token: string };

  const list = await app.inject({ method: "GET", url: "/appointments", headers: auth(slug, promoted.token) });
  assert.equal(list.statusCode, 200, "staff should now hold appointments:view");
});

test("the last owner cannot be demoted", async () => {
  const { app, owner, slug } = await tenantWithMember();

  const response = await app.inject({
    method: "PATCH",
    url: `/users/${owner.userId}/roles`,
    headers: auth(slug, owner.token),
    payload: { roles: ["member"] },
  });
  assert.equal(response.statusCode, 409, response.body);

  // The owner must still be an owner afterwards.
  const list = await app.inject({ method: "GET", url: "/users", headers: auth(slug, owner.token) });
  const stillOwner = (list.json() as { id: string; roles: string[] }[]).find((u) => u.id === owner.userId);
  assert.deepEqual(stillOwner?.roles, ["owner"]);
});

test("an owner may be demoted once a second owner exists", async () => {
  const { app, owner, member, slug } = await tenantWithMember();

  const promote = await app.inject({
    method: "PATCH",
    url: `/users/${member.userId}/roles`,
    headers: auth(slug, owner.token),
    payload: { roles: ["owner"] },
  });
  assert.equal(promote.statusCode, 200, promote.body);

  const demote = await app.inject({
    method: "PATCH",
    url: `/users/${owner.userId}/roles`,
    headers: auth(slug, owner.token),
    payload: { roles: ["member"] },
  });
  assert.equal(demote.statusCode, 200, demote.body);
  assert.deepEqual((demote.json() as { roles: string[] }).roles, ["member"]);
});

test("rejects unknown roles and empty role lists", async () => {
  const { app, owner, member, slug } = await tenantWithMember();

  for (const roles of [[], ["superuser"], ["member", "root"]]) {
    const response = await app.inject({
      method: "PATCH",
      url: `/users/${member.userId}/roles`,
      headers: auth(slug, owner.token),
      payload: { roles },
    });
    assert.equal(response.statusCode, 400, `expected 400 for roles=${JSON.stringify(roles)}`);
  }

  const missingBody = await app.inject({
    method: "PATCH",
    url: `/users/${member.userId}/roles`,
    headers: auth(slug, owner.token),
    payload: {},
  });
  assert.equal(missingBody.statusCode, 400);
});

test("an owner cannot list or modify users belonging to another tenant", async () => {
  const app = buildServer(createAppContext());
  await createTenant(app, "Acme Clinics", "acme-clinics");
  await createTenant(app, "Beta Health", "beta-health");

  const acmeOwner = await signUp(app, "acme-clinics", "owner@acme.com");
  const betaOwner = await signUp(app, "beta-health", "owner@beta.com", "another-pass");

  const betaList = await app.inject({
    method: "GET",
    url: "/users",
    headers: auth("beta-health", betaOwner.token),
  });
  const betaEmails = (betaList.json() as { email: string }[]).map((user) => user.email);
  assert.deepEqual(betaEmails, ["owner@beta.com"], "must not leak the other tenant's users");

  const crossTenant = await app.inject({
    method: "PATCH",
    url: `/users/${acmeOwner.userId}/roles`,
    headers: auth("beta-health", betaOwner.token),
    payload: { roles: ["member"] },
  });
  assert.equal(crossTenant.statusCode, 404, "another tenant's user must not be addressable");
});

test("a role change is recorded in the audit trail with the previous roles", async () => {
  const { app, owner, member, slug } = await tenantWithMember();

  await app.inject({
    method: "PATCH",
    url: `/users/${member.userId}/roles`,
    headers: auth(slug, owner.token),
    payload: { roles: ["staff"] },
  });

  const audit = await app.inject({ method: "GET", url: "/audit-events", headers: auth(slug, owner.token) });
  const events = audit.json() as {
    action: string;
    actorUserId: string | null;
    targetId: string;
    metadata: { previousRoles?: string[]; roles?: string[] };
  }[];

  const roleChange = events.find((event) => event.action === "user.roles_updated");
  assert.ok(roleChange, "expected a user.roles_updated audit event");
  assert.equal(roleChange.actorUserId, owner.userId);
  assert.equal(roleChange.targetId, member.userId);
  assert.deepEqual(roleChange.metadata.previousRoles, ["member"]);
  assert.deepEqual(roleChange.metadata.roles, ["staff"]);
});
