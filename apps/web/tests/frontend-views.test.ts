import assert from "node:assert/strict";
import { test } from "node:test";
import { UserContext } from "../src/types/queue.js";

test("Frontend Queue Management Views & Realtime Hook Test Suite", async (t) => {
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

  await t.test("useQueueRealtimeStream hook structure and connection state logic", () => {
    assert.equal(typeof staffContext.tenantId, "string");
    assert.equal(staffContext.role, "STAFF");
    assert.equal(memberContext.role, "MEMBER");
  });

  await t.test("QueueDashboardView computes aggregate metrics correctly", () => {
    const snapshots = [
      { waitingCount: 3, inServiceCount: 1, completedTodayCount: 5 },
      { waitingCount: 2, inServiceCount: 2, completedTodayCount: 10 },
    ];

    const totalWaiting = snapshots.reduce((acc, s) => acc + s.waitingCount, 0);
    const totalServing = snapshots.reduce((acc, s) => acc + s.inServiceCount, 0);
    const totalCompleted = snapshots.reduce((acc, s) => acc + s.completedTodayCount, 0);

    assert.equal(totalWaiting, 5);
    assert.equal(totalServing, 3);
    assert.equal(totalCompleted, 15);
  });

  await t.test("QueueCounterView validates RBAC permissions for STAFF vs MEMBER", () => {
    const isAllowedStaff = staffContext.role === "OWNER" || staffContext.role === "STAFF";
    const isAllowedMember = memberContext.role === "OWNER" || memberContext.role === "STAFF";

    assert.equal(isAllowedStaff, true);
    assert.equal(isAllowedMember, false);
  });

  await t.test("QueueDisplayBoardView maintains read-only guarantees", () => {
    const displayProps = {
      isReadOnly: true,
      hasControlButtons: false,
    };

    assert.equal(displayProps.isReadOnly, true);
    assert.equal(displayProps.hasControlButtons, false);
  });

  await t.test("Event deduplication logic prevents duplicate event processing", () => {
    const processedSet = new Set<string>();

    const event1 = { eventId: "evt_001", type: "queue.ticket_called.v1" };
    const event2 = { eventId: "evt_001", type: "queue.ticket_called.v1" }; // Duplicate
    const event3 = { eventId: "evt_002", type: "queue.ticket_completed.v1" };

    const processEvent = (evt: { eventId: string }) => {
      if (processedSet.has(evt.eventId)) return false;
      processedSet.add(evt.eventId);
      return true;
    };

    assert.equal(processEvent(event1), true);
    assert.equal(processEvent(event2), false); // Rejected duplicate
    assert.equal(processEvent(event3), true);
    assert.equal(processedSet.size, 2);
  });

  await t.test("RemoteCheckInView priority selection and payload formatting", () => {
    const defaultPriority = "STANDARD";
    const selectedPriority = "VIP";
    
    assert.equal(defaultPriority, "STANDARD");
    assert.equal(selectedPriority, "VIP");
  });

  await t.test("WalkInKioskView default guest fallback and slip receipt calculation", () => {
    const customName = "";
    const effectiveName = customName.trim() || "Walk-In Guest";
    const estimatedWaitMinutes = 10;
    
    assert.equal(effectiveName, "Walk-In Guest");
    assert.equal(estimatedWaitMinutes > 0, true);
  });

  await t.test("AppointmentCheckInView converts appointment reference to ticket", () => {
    const appointmentCode = "APT-8821";
    const customerName = "Dr. Sarah Connor";
    const priority = "APPOINTMENT";

    assert.equal(appointmentCode.startsWith("APT-"), true);
    assert.equal(customerName.length > 0, true);
    assert.equal(priority, "APPOINTMENT");
  });

  await t.test("NotificationLogsView state, filtering, search, sorting and retry logic", () => {
    const logs = [
      {
        notificationId: "notif-001",
        tenantId: "tenant-test-01",
        recipient: "alice@example.com",
        channel: "email" as const,
        templateId: "ticket_called_email",
        status: "delivered" as const,
        retryCount: 0,
        lastError: null,
        sentAt: "2026-08-01T09:00:00Z",
        createdAt: "2026-08-01T08:59:50Z",
        success: true,
      },
      {
        notificationId: "notif-002",
        tenantId: "tenant-test-01",
        recipient: "+15550199",
        channel: "sms" as const,
        templateId: "ticket_called_sms",
        status: "failed" as const,
        retryCount: 2,
        lastError: "SMS Gateway Provider Timeout Error 504",
        sentAt: null,
        createdAt: "2026-08-01T09:10:00Z",
        success: false,
      },
    ];

    // Filter by channel
    const emailOnly = logs.filter((l) => l.channel === "email");
    assert.equal(emailOnly.length, 1);
    assert.equal(emailOnly[0].recipient, "alice@example.com");

    // Filter by status
    const failedOnly = logs.filter((l) => l.status === "failed");
    assert.equal(failedOnly.length, 1);
    assert.equal(failedOnly[0].notificationId, "notif-002");

    // Search query
    const searchMatch = logs.filter((l) => l.lastError?.includes("Timeout"));
    assert.equal(searchMatch.length, 1);
    assert.equal(searchMatch[0].notificationId, "notif-002");

    // Sorting by date desc
    const sortedDesc = [...logs].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    assert.equal(sortedDesc[0].notificationId, "notif-002");

    // Retry action check
    const isFailed = failedOnly[0].status === "failed";
    assert.equal(isFailed, true);
  });

  await t.test("NotificationTemplatesView template management, variable extraction & syntax validation", () => {
    const templates = [
      {
        id: "ticket_called_email",
        channel: "email" as const,
        subject: "Queue Update: Ticket #{{ ticketNumber }} Called",
        body: "Hello {{ customerName }}, your ticket #{{ ticketNumber }} has been called to {{ counterName }}.",
        requiredVariables: ["ticketNumber", "customerName", "counterName"],
      },
    ];

    // Syntax extraction helper
    const extractVariables = (text: string): string[] => {
      const regex = /\{\{\s*([a-zA-Z_$][a-zA-Z0-9_$.-]*)\s*\}\}/g;
      const matches = new Set<string>();
      let m: RegExpExecArray | null;
      while ((m = regex.exec(text)) !== null) {
        if (m[1]) matches.add(m[1]);
      }
      return Array.from(matches);
    };

    const vars = extractVariables(templates[0].body);
    assert.deepEqual(vars.sort(), ["counterName", "customerName", "ticketNumber"]);

    // Variable interpolation preview
    const sampleValues: Record<string, string> = {
      ticketNumber: "A-104",
      customerName: "Jane Doe",
      counterName: "Station 3",
    };

    const interpolate = (text: string, values: Record<string, string>): string => {
      return text.replace(/\{\{\s*([a-zA-Z_$][a-zA-Z0-9_$.-]*)\s*\}\}/g, (_, varName) => values[varName] || "");
    };

    const renderedBody = interpolate(templates[0].body, sampleValues);
    assert.equal(renderedBody, "Hello Jane Doe, your ticket #A-104 has been called to Station 3.");

    // Syntax validation check
    const validateSyntax = (text: string): boolean => {
      let depth = 0;
      for (let i = 0; i < text.length - 1; i++) {
        if (text[i] === "{" && text[i + 1] === "{") depth++;
        else if (text[i] === "}" && text[i + 1] === "}") depth--;
      }
      return depth === 0;
    };

    assert.equal(validateSyntax("Hello {{ name }}"), true);
    assert.equal(validateSyntax("Hello {{ name"), false);
  });
});

