import assert from "node:assert/strict";
import { test } from "node:test";
import { AuthService, InvalidCredentialsError } from "../src/auth-service.js";
import { InMemoryUserRepository } from "../src/in-memory-user-repository.js";
import { DuplicateUserEmailError } from "../src/user-repository.js";

const secret = new TextEncoder().encode("test-only-secret-do-not-use-in-prod");

function service() {
  return new AuthService(new InMemoryUserRepository(), secret);
}

test("signs up a user and issues a verifiable token", async () => {
  const auth = service();
  const result = await auth.signUp({ tenantId: "tenant-a", email: "Owner@Acme.com", password: "correct-horse" });

  assert.ok(result.token);
  const claims = await auth.verifyToken(result.token);
  assert.equal(claims.userId, result.userId);
  assert.equal(claims.tenantId, "tenant-a");
});

test("rejects a duplicate signup within the same tenant", async () => {
  const auth = service();
  await auth.signUp({ tenantId: "tenant-a", email: "owner@acme.com", password: "correct-horse" });

  await assert.rejects(
    () => auth.signUp({ tenantId: "tenant-a", email: "owner@acme.com", password: "correct-horse" }),
    DuplicateUserEmailError,
  );
});

test("allows the same email to sign up independently in a different tenant", async () => {
  const auth = service();
  await auth.signUp({ tenantId: "tenant-a", email: "owner@acme.com", password: "correct-horse" });

  const result = await auth.signUp({ tenantId: "tenant-b", email: "owner@acme.com", password: "another-pass" });
  assert.ok(result.token);
});

test("logs in with correct credentials and rejects incorrect ones", async () => {
  const auth = service();
  await auth.signUp({ tenantId: "tenant-a", email: "owner@acme.com", password: "correct-horse" });

  const login = await auth.login({ tenantId: "tenant-a", email: "owner@acme.com", password: "correct-horse" });
  assert.ok(login.token);

  await assert.rejects(
    () => auth.login({ tenantId: "tenant-a", email: "owner@acme.com", password: "wrong-password" }),
    InvalidCredentialsError,
  );

  await assert.rejects(
    () => auth.login({ tenantId: "tenant-b", email: "owner@acme.com", password: "correct-horse" }),
    InvalidCredentialsError,
  );
});
