import type { FastifyInstance } from "fastify";
import type { BillingLifecycleService } from "@adminops/control-plane";

export function registerBillingLifecycleWorker(app: FastifyInstance, billing: BillingLifecycleService): void {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try { await billing.reconcile(); }
    finally { running = false; }
  };
  const interval = setInterval(() => { void run(); }, 60 * 60 * 1000);
  interval.unref();
  app.addHook("onReady", async () => { void run(); });
  app.addHook("onClose", async () => { clearInterval(interval); });
}
