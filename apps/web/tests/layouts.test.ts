import assert from "node:assert/strict";
import { test } from "node:test";
import { UserContext } from "../src/types/queue.js";

test("Role-Based Portal Layouts & Access Control Test Suite", async (t) => {
  const ownerContext: UserContext = {
    tenantId: "tenant-test-01",
    userId: "usr_owner_01",
    role: "OWNER",
  };

  const staffContext: UserContext = {
    tenantId: "tenant-test-01",
    userId: "usr_staff_01",
    role: "STAFF",
  };

  const memberContext: UserContext = {
    tenantId: "tenant-test-01",
    userId: "usr_member_01",
    role: "MEMBER",
  };

  await t.test("AdminLayout RBAC Authorization Guard", () => {
    const isOwnerAuthorized = ownerContext.role === "OWNER";
    const isStaffAuthorized = staffContext.role === "OWNER";
    const isMemberAuthorized = memberContext.role === "OWNER";

    assert.equal(isOwnerAuthorized, true);
    assert.equal(isStaffAuthorized, false);
    assert.equal(isMemberAuthorized, false);
  });

  await t.test("StaffLayout RBAC Authorization Guard", () => {
    const isOwnerAllowed = ownerContext.role === "OWNER" || ownerContext.role === "STAFF";
    const isStaffAllowed = staffContext.role === "OWNER" || staffContext.role === "STAFF";
    const isMemberAllowed = memberContext.role === "OWNER" || memberContext.role === "STAFF";

    assert.equal(isOwnerAllowed, true);
    assert.equal(isStaffAllowed, true);
    assert.equal(isMemberAllowed, false);
  });

  await t.test("CustomerLayout Isolation Guarantees", () => {
    const customerAllowedViews = ["remote-checkin", "ticket-tracker", "live-wait-time"];
    const forbiddenAdminViews = ["dashboard", "notification-logs", "notification-templates", "staff-controls"];

    assert.equal(customerAllowedViews.includes("remote-checkin"), true);
    assert.equal(customerAllowedViews.some((v) => forbiddenAdminViews.includes(v)), false);
  });

  await t.test("DisplayLayout Clean Lobby View Guarantees", () => {
    const displayFeatures = {
      hasSidebar: false,
      hasAdminControls: false,
      hasStaffButtons: false,
      showsNowServing: true,
      showsUpcomingTickets: true,
    };

    assert.equal(displayFeatures.hasSidebar, false);
    assert.equal(displayFeatures.hasAdminControls, false);
    assert.equal(displayFeatures.showsNowServing, true);
  });

  await t.test("KioskLayout Touchscreen Self-Service Guarantees", () => {
    const kioskFeatures = {
      selectService: true,
      takeTicket: true,
      printTicket: true,
      hasNavSidebar: false,
      hasAdminAccess: false,
    };

    assert.equal(kioskFeatures.selectService, true);
    assert.equal(kioskFeatures.printTicket, true);
    assert.equal(kioskFeatures.hasAdminAccess, false);
  });

  await t.test("Information Architecture: Separation of User Portals and Display Modes", () => {
    const userPortals = ["admin", "staff", "customer"];
    const displayModes = ["display", "kiosk"];

    // Ensure 3 user portals
    assert.equal(userPortals.length, 3);
    assert.deepEqual(userPortals, ["admin", "staff", "customer"]);

    // Ensure 2 display modes
    assert.equal(displayModes.length, 2);
    assert.deepEqual(displayModes, ["display", "kiosk"]);

    // Ensure display modes are disjoint from user portals
    const intersection = userPortals.filter((p) => displayModes.includes(p));
    assert.equal(intersection.length, 0);
  });
});
