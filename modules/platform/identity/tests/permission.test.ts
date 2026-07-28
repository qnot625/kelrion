import assert from "node:assert/strict";
import { test } from "node:test";
import { hasPermission } from "../src/permission.js";

test("owner has every defined permission", () => {
  assert.equal(hasPermission(["owner"], "appointments:book"), true);
  assert.equal(hasPermission(["owner"], "appointments:manage"), true);
  assert.equal(hasPermission(["owner"], "appointments:view"), true);
  assert.equal(hasPermission(["owner"], "tenant:manage"), true);
});

test("member can only book, not manage or view", () => {
  assert.equal(hasPermission(["member"], "appointments:book"), true);
  assert.equal(hasPermission(["member"], "appointments:manage"), false);
  assert.equal(hasPermission(["member"], "appointments:view"), false);
  assert.equal(hasPermission(["member"], "tenant:manage"), false);
});

test("staff can manage and view but not administer the tenant", () => {
  assert.equal(hasPermission(["staff"], "appointments:manage"), true);
  assert.equal(hasPermission(["staff"], "appointments:view"), true);
  assert.equal(hasPermission(["staff"], "tenant:manage"), false);
});

test("an unknown role grants no permissions", () => {
  assert.equal(hasPermission(["intern"], "appointments:book"), false);
});

test("permissions combine across multiple roles", () => {
  assert.equal(hasPermission(["member", "staff"], "appointments:manage"), true);
});
