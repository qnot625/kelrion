# Audited Technical Debt & Known Issues Ledger (Developer 1)

This document tracks all audited issues, architectural bugs, and system limitations discovered within the repository. It serves as a historical and living ledger of technical debt, guiding future resolution strategies.

---

## 🛑 Living Issue Ledger

### ISSUE-001: Absence of Schema Migration History and Version Tracking
- **Issue ID**: ISSUE-001
- **Description**: The database initial migration runner splits the raw `0001_initial.sql` file on semicolons and replays the statements on every single application startup. There is no historical schema migration tracking table (such as a standard migrations ledger metadata table) to prevent replaying statements that have already been executed.
- **Severity**: 🟠 High / Medium
- **Affected Modules**: `@klerion/persistence`
- **Possible Causes**: Early architectural prioritization of rapid, in-memory WASM testing over schema-evolution management.
- **Temporary Workaround**: Every SQL statement in the raw initial migration files must include defensive `IF NOT EXISTS` or `ADD COLUMN IF NOT EXISTS` checks to prevent runtime crashes during startup.
- **Permanent Solution**: Integrate standard **Drizzle Kit Migrations** (`drizzle-kit migrate`), which automatically provisions and manages a `__drizzle_migrations` metadata tracking table to guarantee precise single-run state transitions.
- **Status**: 📝 Audited (No production code changes yet)
- **Related Task**: TASK-003 (Branch Domain Foundation)
- **Related Files**:
  - `/packages/persistence/src/connect.ts` (`runMigrations()`)
  - `/packages/persistence/migrations/0001_initial.sql`
- **Owner**: Developer 1 (Integration Maintainer)
- **Notes**: Must be resolved before shipping the first set of schema modifications to live staging environments.

---

### ISSUE-002: Hardcoded Fallback Arrays in Client Views
- **Issue ID**: ISSUE-002
- **Description**: Standard React components (such as the main admin dashboard Views) fall back to displaying mock static arrays when the backend API returns empty lists. This behavior prevents rendering actual "Empty State" layout widgets and hides real empty database states.
- **Severity**: 🟡 Low
- **Affected Modules**: `apps/web` (Frontend views)
- **Possible Causes**: Rapid UI prototyping using static datasets without connecting final error and empty boundary hooks.
- **Temporary Workaround**: Development engineers must inspect their browser's Network Inspector tab directly to verify that the API endpoints are returning correct, empty payloads.
- **Permanent Solution**: Refactor standard listing views to conditionally render based on live fetch sizes, introducing true states for `.isLoading` skeleton displays, `.error` reload triggers, and `.isEmpty` empty graphic indicators.
- **Status**: 📝 Audited
- **Related Task**: TASK-011 (Public Booking UI)
- **Related Files**:
  - `/apps/web/src/views/AppointmentsView.tsx`
  - `/apps/web/src/views/AuditView.tsx`
- **Owner**: Developer 1 (Integration Maintainer)
- **Notes**: Will be cleaned up during Milestone 8 when connecting the public booking experience flow features.

---

### ISSUE-003: Hot Module Replacement (HMR) Disabled in Sandbox Preview
- **Issue ID**: ISSUE-003
- **Description**: The AI Studio sandbox dev server environment explicitly disables Hot Module Replacement by setting `DISABLE_HMR=true`. This causes the frontend preview browser frame to fail websocket connections, triggering benign console logging errors.
- **Severity**: 🟡 Low / Informational
- **Affected Modules**: `apps/web` (Dev tooling configuration)
- **Possible Causes**: The host control platform disables HMR to prevent incremental file edits from triggering intermediate flickering or broken UI builds during active coding turns.
- **Temporary Workaround**: Ignore console logging errors referring to failed websocket connections (e.g. `[vite] failed to connect to websocket`). The preview will refresh automatically when each developer turn is completed.
- **Permanent Solution**: Retain Vite's standard dynamic HMR capabilities for local development, utilizing the `DISABLE_HMR=true` fallback block strictly in remote sandboxed hosting environments.
- **Status**: 📝 Audited / Solved via Environment Adaptation
- **Related Task**: None (General tooling)
- **Related Files**:
  - `/apps/web/vite.config.ts`
- **Owner**: Developer 1 (Integration Maintainer)
- **Notes**: Benign issue. No manual correction is required.
