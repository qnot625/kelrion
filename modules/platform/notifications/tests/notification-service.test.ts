import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  NotificationService,
  InMemoryNotificationRepository,
  EmailNotificationProvider,
  SMSNotificationProvider,
  NotificationTemplateEngine,
  NotificationStatus,
  NotificationChannel,
  TenantId,
  UserRole,
  UserContext,
  IAuditLogger,
  IDomainEventPublisher,
  IDomainEvent,
  AuditLogEvent,
  TenantMismatchError,
  UnauthorizedError,
  NotificationNotFoundError,
  InvalidNotificationStateError,
  NOTIFICATION_DELIVERED_EVENT_TYPE,
  NOTIFICATION_FAILED_EVENT_TYPE,
  calculateExponentialBackoff,
} from "../src/index.js";

class MockAuditLogger implements IAuditLogger {
  public events: AuditLogEvent[] = [];
  async log(event: AuditLogEvent): Promise<void> {
    this.events.push(event);
  }
}

class MockEventPublisher implements IDomainEventPublisher {
  public events: IDomainEvent[] = [];
  async publish(event: IDomainEvent): Promise<void> {
    this.events.push(event);
  }
}

describe("NotificationService", () => {
  let repository: InMemoryNotificationRepository;
  let emailProvider: EmailNotificationProvider;
  let smsProvider: SMSNotificationProvider;
  let templateEngine: NotificationTemplateEngine;
  let auditLogger: MockAuditLogger;
  let eventPublisher: MockEventPublisher;
  let service: NotificationService;

  const tenantId = TenantId.generate();
  const userContext: UserContext = {
    userId: "usr_123",
    tenantId,
    role: UserRole.STAFF,
  };

  beforeEach(() => {
    repository = new InMemoryNotificationRepository();
    emailProvider = new EmailNotificationProvider({ mode: "console" });
    smsProvider = new SMSNotificationProvider({ mode: "console" });
    templateEngine = new NotificationTemplateEngine();
    auditLogger = new MockAuditLogger();
    eventPublisher = new MockEventPublisher();

    // Register test templates
    templateEngine.registerTemplate({
      id: "welcome_email",
      channel: NotificationChannel.EMAIL,
      subject: "Welcome {{ name }}",
      body: "Hello {{ name }}, welcome to {{ service }}!",
    });

    templateEngine.registerTemplate({
      id: "ticket_alert_sms",
      channel: NotificationChannel.SMS,
      subject: "SMS Alert",
      body: "Ticket #{{ number }} is now ready at counter {{ counter }}.",
    });

    service = new NotificationService({
      repository,
      providers: [emailProvider, smsProvider],
      templateEngine,
      auditLogger,
      eventPublisher,
      maxRetries: 3,
    });
  });

  it("should successfully render template and deliver an email notification", async () => {
    const result = await service.sendNotification(
      {
        recipient: "alice@example.com",
        channel: NotificationChannel.EMAIL,
        templateId: "welcome_email",
        variables: { name: "Alice", service: "AdminOps" },
      },
      userContext
    );

    assert.equal(result.success, true);
    assert.equal(result.status, NotificationStatus.SENT);
    assert.equal(result.recipient, "alice@example.com");
    assert.ok(result.sentAt instanceof Date);

    // Verify repository state
    const { notifications } = await repository.findByTenant(tenantId);
    assert.equal(notifications.length, 1);
    assert.equal(notifications[0].status, NotificationStatus.SENT);

    // Verify audit log
    const deliveredAudit = auditLogger.events.find((e) => e.action === "NOTIFICATION_DELIVERED");
    assert.ok(deliveredAudit);
    assert.equal(deliveredAudit.resourceId, result.notificationId);

    // Verify domain event
    const deliveredEvent = eventPublisher.events.find(
      (e) => e.eventType === NOTIFICATION_DELIVERED_EVENT_TYPE
    );
    assert.ok(deliveredEvent);
    assert.equal(deliveredEvent.tenantId, tenantId.value);
    assert.equal(deliveredEvent.aggregateId, result.notificationId);
  });

  it("should successfully send an SMS notification", async () => {
    const result = await service.sendNotification(
      {
        recipient: "+15551234567",
        channel: NotificationChannel.SMS,
        templateId: "ticket_alert_sms",
        variables: { number: "A-101", counter: "3" },
      },
      userContext
    );

    assert.equal(result.success, true);
    assert.equal(result.status, NotificationStatus.SENT);
  });

  it("should fail gracefully when required template variable is missing", async () => {
    const result = await service.sendNotification(
      {
        recipient: "bob@example.com",
        channel: NotificationChannel.EMAIL,
        templateId: "welcome_email",
        variables: { name: "Bob" }, // missing service variable
      },
      userContext
    );

    assert.equal(result.success, false);
    assert.equal(result.status, NotificationStatus.FAILED);
    assert.ok(result.lastError?.includes("service"));

    // Verify domain event notification.failed.v1 was published with willRetry: false
    const failedEvent = eventPublisher.events.find(
      (e) => e.eventType === NOTIFICATION_FAILED_EVENT_TYPE
    );
    assert.ok(failedEvent);
    assert.equal((failedEvent.payload as any).willRetry, false);
  });

  it("should enforce tenant isolation and reject tenant mismatch", async () => {
    const otherTenant = TenantId.generate();

    await assert.rejects(
      async () => {
        await service.sendNotification(
          {
            tenantId: otherTenant,
            recipient: "carol@example.com",
            channel: NotificationChannel.EMAIL,
            templateId: "welcome_email",
            variables: { name: "Carol", service: "AdminOps" },
          },
          userContext
        );
      },
      (err: any) => err instanceof TenantMismatchError
    );
  });

  it("should reject unauthenticated request without valid context", async () => {
    await assert.rejects(
      async () => {
        await service.sendNotification(
          {
            recipient: "carol@example.com",
            channel: NotificationChannel.EMAIL,
            templateId: "welcome_email",
          },
          null as any
        );
      },
      (err: any) => err instanceof UnauthorizedError
    );
  });

  it("should correctly handle retries for recoverable failures", async () => {
    let attempts = 0;
    const failingProvider = {
      providerName: "FailingProvider",
      channel: NotificationChannel.EMAIL,
      send: async () => {
        attempts++;
        if (attempts < 2) {
          return { success: false, error: "Transient gateway timeout" };
        }
        return { success: true, providerMessageId: "msg_success_123" };
      },
    };

    const retryService = new NotificationService({
      repository,
      providers: [failingProvider],
      templateEngine,
      auditLogger,
      eventPublisher,
      maxRetries: 3,
    });

    const initialResult = await retryService.sendNotification(
      {
        recipient: "dave@example.com",
        channel: NotificationChannel.EMAIL,
        templateId: "welcome_email",
        variables: { name: "Dave", service: "AdminOps" },
      },
      userContext
    );

    assert.equal(initialResult.success, false);
    assert.equal(initialResult.status, NotificationStatus.FAILED);
    assert.equal(initialResult.retryCount, 1);
    assert.equal(initialResult.willRetry, true);

    // Retry sending
    const retryResult = await retryService.retryNotification(
      initialResult.notificationId,
      userContext
    );

    assert.equal(retryResult.success, true);
    assert.equal(retryResult.status, NotificationStatus.SENT);
    assert.equal(retryResult.providerReference, "msg_success_123");
  });

  it("should refuse to retry an already SENT notification (idempotency)", async () => {
    const result = await service.sendNotification(
      {
        recipient: "eve@example.com",
        channel: NotificationChannel.EMAIL,
        templateId: "welcome_email",
        variables: { name: "Eve", service: "AdminOps" },
      },
      userContext
    );

    assert.equal(result.status, NotificationStatus.SENT);

    await assert.rejects(
      async () => {
        await service.retryNotification(result.notificationId, userContext);
      },
      (err: any) => err instanceof InvalidNotificationStateError
    );
  });

  it("should calculate exponential backoff correctly", () => {
    assert.equal(calculateExponentialBackoff(1, 1000), 1000);
    assert.equal(calculateExponentialBackoff(2, 1000), 2000);
    assert.equal(calculateExponentialBackoff(3, 1000), 4000);
    assert.equal(calculateExponentialBackoff(4, 1000, 5000), 5000);
  });
});
