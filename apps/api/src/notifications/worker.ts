import type { FastifyInstance } from "fastify";
import type { NotificationProviderMap } from "@adminops/notifications";
import type { AppContext } from "../context.js";

export function registerNotificationDeliveryWorker(app: FastifyInstance, context: AppContext): void {
  const providers = context.notificationProviders ?? ({} as NotificationProviderMap);
  if (!Object.values(providers).some(Boolean)) return;
  let running = false;

  const run = async () => {
    if (running) return;
    running = true;
    try {
      const tenants = await context.tenantRepository.list();
      for (const tenant of tenants) {
        try {
          await context.controlPlaneService.assertModuleEnabled(tenant.id, "notifications");
          await context.notificationService.processPending(tenant.id, providers, 50);
        } catch {
          // Disabled organisations and transient provider failures remain in durable outbox state.
        }
      }
    } finally {
      running = false;
    }
  };

  const interval = setInterval(() => { void run(); }, 30_000);
  interval.unref();
  app.addHook("onReady", async () => { void run(); });
  app.addHook("onClose", async () => { clearInterval(interval); });
}
