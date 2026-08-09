export type ModuleKey =
  | "branches"
  | "appointments"
  | "queue"
  | "notifications"
  | "employees"
  | "attendance"
  | "leave"
  | "lifecycle"
  | "forms"
  | "workflow"
  | "approvals"
  | "service-desk"
  | "cases"
  | "analytics"
  | "recruitment";

export type ModuleCategory = "customer-operations" | "workforce" | "service-operations" | "intelligence";
export type SupportedCurrency = "NGN" | "USD" | "GBP" | "EUR";

export interface ModuleDefinition {
  readonly key: ModuleKey;
  readonly name: string;
  readonly description: string;
  readonly category: ModuleCategory;
  readonly dependencies: readonly ModuleKey[];
  readonly prices: Readonly<Record<SupportedCurrency, number>>;
  readonly availability: "live" | "preview";
}

const price = (ngn: number, usd: number, gbp: number, eur: number): ModuleDefinition["prices"] => ({ NGN: ngn, USD: usd, GBP: gbp, EUR: eur });

export const MODULE_CATALOGUE: readonly ModuleDefinition[] = [
  { key: "branches", name: "Branches & Services", description: "Locations, departments, service catalogue and capacity discovery.", category: "customer-operations", dependencies: [], prices: price(600000, 3900, 3200, 3600), availability: "live" },
  { key: "appointments", name: "Appointments", description: "Availability, booking, rescheduling, cancellation and waitlists.", category: "customer-operations", dependencies: ["branches"], prices: price(500000, 3200, 2600, 2900), availability: "live" },
  { key: "queue", name: "Virtual Queue", description: "Remote check-in, ticket operations, counters, kiosks and display boards.", category: "customer-operations", dependencies: ["branches"], prices: price(700000, 4500, 3700, 4100), availability: "live" },
  { key: "notifications", name: "Notifications", description: "Email and SMS templates, delivery logs, retries and reminders.", category: "customer-operations", dependencies: [], prices: price(350000, 2300, 1900, 2100), availability: "live" },
  { key: "employees", name: "Employee Records", description: "Employee master data, organisation directory and reporting hierarchy.", category: "workforce", dependencies: [], prices: price(550000, 3500, 2900, 3200), availability: "live" },
  { key: "attendance", name: "Time & Attendance", description: "Clock-in, clock-out, breaks, timesheets, offline sync and corrections.", category: "workforce", dependencies: ["employees"], prices: price(500000, 3200, 2600, 2900), availability: "live" },
  { key: "leave", name: "Leave & Availability", description: "Leave balances, requests, approvals and absence visibility.", category: "workforce", dependencies: ["employees"], prices: price(350000, 2300, 1900, 2100), availability: "live" },
  { key: "lifecycle", name: "Onboarding & Offboarding", description: "Reusable employee lifecycle plans and accountable checklists.", category: "workforce", dependencies: ["employees"], prices: price(350000, 2300, 1900, 2100), availability: "live" },
  { key: "forms", name: "Dynamic Forms", description: "Versioned form definitions, validation and submissions.", category: "service-operations", dependencies: [], prices: price(400000, 2600, 2100, 2400), availability: "live" },
  { key: "workflow", name: "Workflow Automation", description: "Versioned state machines, human tasks, delegation and history.", category: "service-operations", dependencies: ["forms"], prices: price(650000, 4200, 3400, 3800), availability: "live" },
  { key: "approvals", name: "Approvals", description: "Approval inbox, decisions, reassignment and information requests.", category: "service-operations", dependencies: ["workflow"], prices: price(350000, 2300, 1900, 2100), availability: "live" },
  { key: "service-desk", name: "Internal Service Desk", description: "Employee service requests, request catalogue, agent triage, approvals, fulfilment workflows, comments and SLAs.", category: "service-operations", dependencies: ["forms", "workflow", "approvals"], prices: price(600000, 3900, 3200, 3600), availability: "live" },
  { key: "cases", name: "Cases & Complaints", description: "Customer cases, ownership, priorities, comments and SLA resolution.", category: "service-operations", dependencies: [], prices: price(500000, 3200, 2600, 2900), availability: "live" },
  { key: "analytics", name: "Executive Intelligence", description: "Operational scorecards, trends, SLA compliance and command-centre reporting.", category: "intelligence", dependencies: [], prices: price(450000, 2900, 2400, 2700), availability: "live" },
  { key: "recruitment", name: "Recruitment", description: "Candidate pipeline and interview operations.", category: "workforce", dependencies: ["employees"], prices: price(400000, 2600, 2100, 2400), availability: "preview" },
] as const;

const BY_KEY = new Map<ModuleKey, ModuleDefinition>(MODULE_CATALOGUE.map((module) => [module.key, module]));

export function getModuleDefinition(key: ModuleKey): ModuleDefinition {
  const definition = BY_KEY.get(key);
  if (!definition) throw new Error(`Unknown module: ${key}`);
  return definition;
}

export function isModuleKey(value: string): value is ModuleKey { return BY_KEY.has(value as ModuleKey); }

export function assertLiveModuleSelection(selection: readonly ModuleKey[]): void {
  const preview = selection.filter((key) => getModuleDefinition(key).availability !== "live");
  if (preview.length) throw new Error(`Preview modules cannot be enabled on live subscriptions: ${preview.join(", ")}`);
}

export function expandModuleSelection(selection: readonly ModuleKey[]): ModuleKey[] {
  const expanded = new Set<ModuleKey>();
  const visit = (key: ModuleKey) => {
    if (expanded.has(key)) return;
    for (const dependency of getModuleDefinition(key).dependencies) visit(dependency);
    expanded.add(key);
  };
  for (const key of selection) visit(key);
  return [...expanded];
}
