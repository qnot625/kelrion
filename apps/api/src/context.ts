import { AuthService, InMemoryUserRepository } from "@adminops/identity";
import { InMemoryTenantRepository } from "@adminops/tenancy";
import { AppointmentService, InMemoryAppointmentRepository } from "@adminops/branch-flow";

function resolveTokenSecret(): Uint8Array {
  const configured = process.env.SESSION_TOKEN_SECRET;
  if (!configured && process.env.NODE_ENV === "production") {
    throw new Error("SESSION_TOKEN_SECRET must be set in production");
  }
  return new TextEncoder().encode(configured ?? "dev-only-insecure-secret-change-me");
}

export function createAppContext() {
  const tenantRepository = new InMemoryTenantRepository();
  const authService = new AuthService(new InMemoryUserRepository(), resolveTokenSecret());
  const appointmentService = new AppointmentService(new InMemoryAppointmentRepository());

  return { tenantRepository, authService, appointmentService };
}

export type AppContext = ReturnType<typeof createAppContext>;
