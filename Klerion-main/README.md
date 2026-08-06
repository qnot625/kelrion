# AdminOps OS - Enterprise Internal Operations Platform

AdminOps OS is an enterprise-grade internal operations management platform featuring a modular, multi-tenant architecture with form schema management, visual workflow execution DAGs, unified multi-step approval engines, and an IT/HR service desk portal.

---

## 🏗️ Architecture & Core Modules

### 1. `modules/platform/forms` (Forms Engine)
- **Form Schema Builder**: Dynamic field schema definitions (text, number, select, date, multi-select, signature, file upload) with regex and min/max validation rules.
- **Conditional Visibility**: Expression engine for field-level visibility dependencies.
- **Submission Engine**: Draft saving, version lock verification, payload validation, and immutable submission records with audit logs.

### 2. `modules/platform/workflow` (Workflow DAG Engine)
- **Workflow Definitions**: Directed Acyclic Graph (DAG) state machines supporting automatic tasks, human tasks, branching decision gateways, and approval nodes.
- **Execution Service**: Asynchronous condition evaluation engine with step transition validation, instance pausing/resuming, and cancellation semantics.
- **Human Task Service**: Task lifecycle management (claim, release, delegate, complete) with automated SLA timer evaluations and escalation triggers.

### 3. `modules/domains/internal-services` (Approval & Service Desk Domain)
- **Approval Engine**: Multi-step sequential and parallel approval routing, delegation rules, information requests, and automatic workflow integration via `WorkflowApprovalAdapter`.
- **Service Desk Domain**: Enterprise service catalog, `ServiceTicket` aggregate root enforcing priority-driven SLA target windows, dual public/internal communication feeds, assignment routing, and ticket lifecycle state transitions.

### 4. `apps/api` (Fastify API Gateway)
- RESTful HTTP API with Fastify, multi-tenant request isolation via `x-tenant-id` header context, RBAC security (`x-user-role`), structured audit logging, and automated integration test coverage.

### 5. `apps/web` (React Single-Page Application)
- Interactive SPA built with React 18, Vite, and Tailwind CSS.
- Integrates 5 core workspace modules:
  1. **Employee Service Portal**: Browse service catalog, create requests, and track ticket status.
  2. **Agent Service Desk Workspace**: Queue triage, metric dashboards, SLA monitoring, and internal agent notes drawer.
  3. **Unified Approval Inbox**: Manage pending approvals, delegate steps, and request additional information.
  4. **Visual Workflow DAG Studio**: Inspect step graphs, human task configurations, and execution histories.
  5. **Form Schema Studio**: Build form definitions, test validation schemas, and view submission payloads.

---

## 🛠️ Development & Execution Commands

### Prerequisites
- Node.js v20+
- npm v10+

### Installation
```bash
npm install
```

### Running Applications
```bash
# Start Web Frontend (port 3000)
npm run dev

# Start API Backend (port 3001)
npm run dev:api
```

### Verification & Testing
```bash
# Compile TypeScript across all workspaces
npm run typecheck

# Lint codebase with ESLint
npm run lint

# Run unit and integration test suites
npm test --workspace=apps/api
```

---

## 📄 License
Private & Proprietary - Klerion AdminOps OS Enterprise Edition.
