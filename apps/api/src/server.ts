import fastify, { FastifyInstance } from "fastify";
import {
  InMemoryQueueRepository,
  InMemoryTicketRepository,
  QueueApplicationService,
  TicketApplicationService,
  IQueueRepository,
  ITicketRepository,
  IAuditLogger,
  IDomainEventPublisher,
} from "@klerion/queue";
import {
  NotificationService,
  InMemoryNotificationRepository,
  INotificationRepository,
  EmailNotificationProvider,
  SMSNotificationProvider,
  NotificationTemplateEngine,
} from "@klerion/notifications";
import { queueRoutes } from "./routes/queues.js";
import { checkInRoutes } from "./routes/check-in.js";
import { ticketRoutes } from "./routes/tickets.js";
import { realtimeRoutes } from "./routes/realtime.js";
import { notificationRoutes } from "./routes/notifications.js";
import { SSEManager } from "./realtime/sse-manager.js";

export interface ServerOptions {
  queueRepository?: IQueueRepository;
  ticketRepository?: ITicketRepository;
  notificationRepository?: INotificationRepository;
  auditLogger?: IAuditLogger;
  eventPublisher?: IDomainEventPublisher;
  sseManager?: SSEManager;
  queueApplicationService?: QueueApplicationService;
  ticketApplicationService?: TicketApplicationService;
  notificationService?: NotificationService;
  logger?: boolean;
}

export function buildServer(options: ServerOptions = {}): FastifyInstance {
  const server = fastify({
    logger: options.logger ?? false,
  });

  const queueRepo = options.queueRepository ?? new InMemoryQueueRepository();
  const ticketRepo = options.ticketRepository ?? new InMemoryTicketRepository(queueRepo);
  const notificationRepo = options.notificationRepository ?? new InMemoryNotificationRepository();

  const sseManager = options.sseManager ?? new SSEManager();

  const eventPublisher: IDomainEventPublisher = {
    publish: async (event) => {
      if (options.eventPublisher) {
        await options.eventPublisher.publish(event);
      }
      sseManager.broadcast(event);
    },
  };

  const queueAppService =
    options.queueApplicationService ??
    new QueueApplicationService(queueRepo, options.auditLogger, eventPublisher);

  const ticketAppService =
    options.ticketApplicationService ??
    new TicketApplicationService(
      ticketRepo,
      queueRepo,
      options.auditLogger,
      eventPublisher
    );

  const emailProvider = new EmailNotificationProvider({ mode: "console" });
  const smsProvider = new SMSNotificationProvider({ mode: "console" });

  const notificationService =
    options.notificationService ??
    new NotificationService({
      repository: notificationRepo,
      providers: [emailProvider, smsProvider],
      templateEngine: new NotificationTemplateEngine(),
      auditLogger: options.auditLogger,
      eventPublisher: eventPublisher as any,
    });

  // Health check endpoint
  server.get("/health", async () => {
    return { status: "ok", service: "AdminOps API Service" };
  });

  // Register route handlers
  server.register(queueRoutes, {
    queueApplicationService: queueAppService,
    ticketApplicationService: ticketAppService,
  });

  server.register(checkInRoutes, {
    ticketApplicationService: ticketAppService,
  });

  server.register(ticketRoutes, {
    ticketApplicationService: ticketAppService,
  });

  server.register(realtimeRoutes, {
    sseManager,
    queueRepository: queueRepo,
    ticketApplicationService: ticketAppService,
  });

  server.register(notificationRoutes, {
    notificationService,
  });

  return server;
}

