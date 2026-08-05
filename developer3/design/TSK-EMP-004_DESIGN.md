# Klerion Engineering Design Document: TSK-EMP-004 — Employee Management REST API Service Layer

**Author**: Developer 3 (Senior Backend Architect, DDD Expert, Fastify Architect)  
**Task ID**: TSK-EMP-004  
**Milestone**: Milestone 4 — Employee REST APIs & RBAC  
**Module**: `apps/api` & `@adminops/workforce-core`  
**Status**: DESIGN SUBMITTED FOR ARCHITECTURE REVIEW  
**Date**: 2026-07-31  

---

## 1. Purpose & Scope

### 1.1 Purpose
TSK-EMP-004 establishes the secure, high-performance REST API service layer and application service abstractions for Employee Management in Klerion. It connects HTTP request ingress (Fastify controllers in `apps/api`) with domain core operations (`@adminops/workforce-core`) and persistence (`@adminops/persistence`), enforcing multi-tenant isolation, Role-Based Access Control (RBAC), input validation, audit logging, and domain error translation.

### 1.2 Problems Solved
- Provides clean, tenant-isolated REST endpoints for administrative staff and branch operations managers to manage workforce records.
- Prevents cross-tenant data leakage and unauthorized access at the HTTP/API layer.
- Enforces strict circular manager hierarchy prevention during HTTP manager updates.
- Emits structured audit log records (`employee.created`, `employee.updated`, `employee.manager_assigned`, `employee.status_changed`, `employee.deleted`) for compliance.
- Establishes clean application service boundaries (`EmployeeService`) separating HTTP concerns (Fastify schemas, headers, status codes) from core domain aggregate invariants.

### 1.3 Scope & Non-Goals
- **In-Scope**:
  - `EmployeeService` application service class in `@adminops/workforce-core` (or `apps/api`).
  - Fastify route definitions in `apps/api/src/routes/employees.ts`.
  - Permission constants in `@adminops/identity` (`employees:create`, `employees:read`, `employees:update`, `employees:delete`, `employees:manage_hierarchy`).
  - Request/Response validation using Fastify JSON schemas / Zod schemas.
  - Integration with `AppContext`, `authGuard`, `tenantContext`, and `auditLog`.
  - Unit and integration tests for `EmployeeService` and REST routes.
- **Out-of-Scope (Non-Goals)**:
  - Frontend UI components or views (deferred to TSK-EMP-005 & TSK-EMP-006).
  - Attendance clock-in/clock-out API endpoints (deferred to Milestone 6).
  - External HR system webhooks or third-party OAuth connectors.

---

## 2. Application Service Boundary & Layer Architecture

```text
       ┌────────────────────────────────────────────────────────┐
       │               Fastify HTTP Ingress Layer               │
       │   (routes/employees.ts, tenantContext, authGuard)       │
       └───────────────────────────┬────────────────────────────┘
                                   │  Validates HTTP requests & claims
                                   ▼
       ┌────────────────────────────────────────────────────────┐
       │                Application Service Layer               │
       │                   (EmployeeService)                    │
       └──────┬────────────────────┬────────────────────┬───────┘
              │                    │                    │
              ▼                    ▼                    ▼
   ┌──────────────────────┐┌───────────────┐┌──────────────────┐
   │  Domain Core Layer   ││ Hierarchy Engine││ Audit Log Module │
   │ (Employee Aggregate, ││ (validateManager││  (@adminops/     │
   │   Domain Events)     ││  Hierarchy)   ││     audit)       │
   └──────────────────────┘└───────────────┘└──────────────────┘
              ▲
              │ Reconstitutes / Saves Aggregates
   ┌──────────┴─────────────────────────────────────────────────┐
   │                 Infrastructure Persistence                 │
   │               (PostgresEmployeeRepository)                 │
   └────────────────────────────────────────────────────────────┘
```

### 2.1 Dependency Directions
1. **API Layer (`apps/api`)**: Depends on `EmployeeService`, `tenantContext`, `authGuard`, `requirePermission`, and `AuditLog`. Contains zero SQL queries or raw domain state manipulation.
2. **Application Layer (`EmployeeService`)**: Orchestrates use cases using `EmployeeRepository`, `ManagerHierarchyProvider`, `Employee` domain aggregate, and `AuditLog`. Has zero HTTP framework dependencies (no Fastify `request`/`reply` objects).
3. **Domain Layer (`@adminops/workforce-core`)**: Pure domain invariants, Zod schemas, aggregates, and value objects. Contains zero infrastructure or persistence imports.
4. **Persistence Layer (`@adminops/persistence`)**: Implements `EmployeeRepository` contract, handles Drizzle ORM queries, handles tenant filtering, translates DB constraint violations into `EmployeeDomainError`.

---

## 3. Employee Use Cases Design

The `EmployeeService` class exposes clean, type-safe methods corresponding to each primary business use case:

### Use Case 1: `createEmployee`
- **Input**: `tenantId: string`, `actorUserId: string`, `input: CreateEmployeeInput`
- **Logic**:
  1. Checks if `employeeNumber` or `email` already exists in tenant repository (`findByEmployeeNumber`, `findByEmail`).
  2. If `managerId` is provided, invokes `validateManagerHierarchy` using `getManagerNode` provider to verify manager belongs to same tenant and is active.
  3. Instantiates `Employee.create(input)` aggregate root.
  4. Saves aggregate via `employeeRepository.save(employee)`.
  5. Records `employee.created` audit log event.
- **Output**: Reconstituted `Employee` aggregate state formatted as response DTO.

### Use Case 2: `getEmployeeById`
- **Input**: `tenantId: string`, `employeeId: string`
- **Logic**: Invokes `employeeRepository.findById(tenantId, employeeId)`. Throws `EmployeeNotFoundError` if `null`.
- **Output**: `Employee` aggregate response DTO.

### Use Case 3: `listEmployees`
- **Input**: `tenantId: string`, `options?: EmployeeFilterOptions` (`departmentId`, `positionId`, `managerId`, `branchId`, `employmentStatus`, `search`, `limit`, `offset`)
- **Logic**: Calls `employeeRepository.list(tenantId, options)` and `employeeRepository.count(tenantId, options)`.
- **Output**: `{ data: EmployeeDto[], total: number, limit: number, offset: number }`.

### Use Case 4: `updateEmployee`
- **Input**: `tenantId: string`, `actorUserId: string`, `employeeId: string`, `input: UpdateEmployeeInput`
- **Logic**:
  1. Retrieves existing aggregate via `findById`. Throws `EmployeeNotFoundError` if missing.
  2. If `email` is updated, checks for uniqueness conflict within tenant.
  3. If `managerId` is updated, invokes `validateManagerHierarchy` to prevent self-management or circular reporting cycles.
  4. Calls `employee.updateProfile(...)` and `employee.assignPlacement(...)`.
  5. Saves updated aggregate via `employeeRepository.save(employee)`.
  6. Records `employee.updated` audit log event.
- **Output**: Updated `Employee` aggregate DTO.

### Use Case 5: `assignManager`
- **Input**: `tenantId: string`, `actorUserId: string`, `employeeId: string`, `proposedManagerId: string | null`
- **Logic**:
  1. Retrieves employee aggregate.
  2. Invokes `validateManagerHierarchy(tenantId, employeeId, proposedManagerId, repository)` to ensure zero cycles and active manager status.
  3. Calls `employee.assignPlacement({ managerId: proposedManagerId })`.
  4. Saves aggregate to repository.
  5. Records `employee.manager_assigned` audit event.
- **Output**: Updated `Employee` aggregate DTO.

### Use Case 6: `updateEmploymentStatus`
- **Input**: `tenantId: string`, `actorUserId: string`, `employeeId: string`, `action: 'suspend' | 'reactivate' | 'terminate'`, `reason?: string`, `terminationDate?: string`
- **Logic**:
  1. Retrieves aggregate.
  2. Invokes appropriate aggregate method (`employee.suspend(reason)`, `employee.activate()`, or `employee.terminate(terminationDate, reason)`).
  3. Saves updated aggregate to repository.
  4. Records `employee.status_changed` audit event.
- **Output**: Updated `Employee` aggregate DTO.

### Use Case 7: `deleteEmployee`
- **Input**: `tenantId: string`, `actorUserId: string`, `employeeId: string`
- **Logic**:
  1. Verifies employee exists in tenant.
  2. Calls `employeeRepository.delete(tenantId, employeeId)`.
  3. Records `employee.deleted` audit event.
- **Output**: `{ success: true }`.

---

## 4. REST API Contract Design

Base path: `/api/v1/employees`

### 4.1 Endpoints Specification

| Method | Endpoint | Permission Required | Summary | Success Status |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/employees` | `employees:create` | Create new employee record | `201 Created` |
| `GET` | `/api/v1/employees` | `employees:read` | List employees with filters & pagination | `200 OK` |
| `GET` | `/api/v1/employees/:id` | `employees:read` | Get employee details by ID | `200 OK` |
| `PATCH` | `/api/v1/employees/:id` | `employees:update` | Update employee profile/placement | `200 OK` |
| `PATCH` | `/api/v1/employees/:id/manager` | `employees:manage_hierarchy` | Update reporting manager | `200 OK` |
| `PATCH` | `/api/v1/employees/:id/status` | `employees:update` | Suspend, reactivate, or terminate employee | `200 OK` |
| `DELETE` | `/api/v1/employees/:id` | `employees:delete` | Soft/hard delete employee record | `200 OK` |

### 4.2 Representative Request / Response Schemas

#### `POST /api/v1/employees`
- **Headers**:
  - `Authorization`: `Bearer <jwt_token>`
  - `X-Tenant-Slug`: `<tenant_slug>`
- **Request Body**:
  ```json
  {
    "employeeNumber": "EMP-1001",
    "firstName": "Sarah",
    "lastName": "Connor",
    "email": "s.connor@branch.acme.com",
    "phone": "+1-555-0199",
    "departmentId": "d1234567-89ab-cdef-0123-456789abcdef",
    "positionId": "p1234567-89ab-cdef-0123-456789abcdef",
    "managerId": null,
    "branchId": "branch-01",
    "employmentType": "full_time",
    "hireDate": "2026-01-15"
  }
  ```
- **Response Body (`201 Created`)**:
  ```json
  {
    "id": "e1234567-89ab-cdef-0123-456789abcdef",
    "tenantId": "t1234567-89ab-cdef-0123-456789abcdef",
    "userId": null,
    "employeeNumber": "EMP-1001",
    "firstName": "Sarah",
    "lastName": "Connor",
    "email": "s.connor@branch.acme.com",
    "phone": "+1-555-0199",
    "departmentId": "d1234567-89ab-cdef-0123-456789abcdef",
    "positionId": "p1234567-89ab-cdef-0123-456789abcdef",
    "managerId": null,
    "branchId": "branch-01",
    "employmentType": "full_time",
    "employmentStatus": "active",
    "hireDate": "2026-01-15",
    "terminationDate": null,
    "createdAt": "2026-07-31T06:44:00.000Z",
    "updatedAt": "2026-07-31T06:44:00.000Z"
  }
  ```

#### `GET /api/v1/employees`
- **Query Parameters**: `departmentId`, `positionId`, `managerId`, `branchId`, `employmentStatus`, `search`, `limit` (default: 20, max: 100), `offset` (default: 0).
- **Response Body (`200 OK`)**:
  ```json
  {
    "data": [ ... ],
    "total": 42,
    "limit": 20,
    "offset": 0
  }
  ```

---

## 5. RBAC & Security Design

### 5.1 RBAC Permission Mapping
Permissions added to `@adminops/identity/src/permission.ts`:

- `employees:create`: Mapped to `owner`, `staff`.
- `employees:read`: Mapped to `owner`, `staff`, `member`.
- `employees:update`: Mapped to `owner`, `staff`.
- `employees:delete`: Mapped to `owner`.
- `employees:manage_hierarchy`: Mapped to `owner`, `staff`.

### 5.2 Multi-Tenant Security Enforcement
1. **Tenant Context Resolution**: Every request passes through `registerTenantContext` which resolves `X-Tenant-Slug` to `request.tenant = { tenantId, tenantSlug }`.
2. **Auth Token Tenant Binding**: `registerAuthGuard` verifies `claims.tenantId === request.tenant.tenantId`. A token issued for tenant A cannot access tenant B's endpoints under any header spoofing attempt (`401 Token does not match requested tenant`).
3. **Repository Scope Enforcement**: Every repository operation requires `tenantId`. `WHERE tenant_id = $tenantId` is appended to all SQL queries in `PostgresEmployeeRepository`.

---

## 6. Validation Strategy

1. **HTTP Parameter & Payload Validation**: Fastify `JSON Schema` / Zod validation at route level checks data types, UUID formats, email strings, and required fields before entering handler logic.
2. **Domain Invariant Validation**: Aggregate root and Zod schemas in `@adminops/workforce-core` enforce business invariants (e.g. ISO date format `YYYY-MM-DD`, non-empty names, valid status transitions).
3. **Persistence & Database Constraint Validation**: Postgres unique indexes enforce `(tenant_id, employee_number)` and `(tenant_id, email)` uniqueness at database transaction commit.

---

## 7. Error Handling Strategy

| Error Class / Exception | Triggering Condition | HTTP Status Code | Response Body |
| :--- | :--- | :---: | :--- |
| `ZodError` / Fastify Validation Error | Malformed request body, invalid UUID/email | `400 Bad Request` | `{ "error": "Invalid request body: email is required" }` |
| `EmployeeDomainError` | Domain invariant violation, circular hierarchy loop | `400 Bad Request` / `409 Conflict` | `{ "error": "Circular reporting hierarchy detected" }` |
| Unique Constraint Violation | Duplicate `employeeNumber` or `email` in tenant | `409 Conflict` | `{ "error": "Employee number [EMP-1001] already exists for tenant" }` |
| `EmployeeNotFoundError` | Employee ID does not exist in tenant scope | `404 Not Found` | `{ "error": "Employee not found" }` |
| Unauthorized / Missing Token | Missing or invalid Bearer JWT token | `401 Unauthorized` | `{ "error": "Missing Authorization bearer token" }` |
| Missing Permission | Authenticated user lacks required RBAC permission | `403 Forbidden` | `{ "error": "Missing required permission: employees:update" }` |

---

## 8. Transaction & Domain Event Strategy

- **Repository Persistence**: `PostgresEmployeeRepository.save()` executes atomic database updates.
- **Audit Logging**: `auditLog.record()` is invoked synchronously after successful domain operation execution within the application service.
- **Domain Event Propagation**: Aggregate events stored on `employee.domainEvents` are recorded and flushed upon successful save.

---

## 9. Testing Strategy

### 9.1 Unit Testing (`packages/persistence` & `modules/domains/workforce-core`)
- Test `EmployeeService` methods using an `InMemoryEmployeeRepository` or mock `EmployeeRepository`.
- Test validation logic, error translation, and audit log generation.

### 9.2 Integration Testing (`apps/api/tests/employees.test.ts`)
- Build Fastify test server instance with `createAppContext()` / `createPostgresAppContext()`.
- Test HTTP endpoint responses (`POST`, `GET`, `PATCH`, `DELETE`).
- Verify multi-tenant header isolation (`X-Tenant-Slug`).
- Verify RBAC permission enforcement (`403 Forbidden` for `member` role attempting `POST /employees` or `DELETE /employees`).
- Verify duplicate key handling (`409 Conflict`).
- Verify hierarchy validation over HTTP (`400 Bad Request` when assigning circular manager).

---

## 10. Performance & Scalability Analysis

- **Indexed Database Lookups**: All lookups query indexed fields (`tenant_id`, `id`, `employee_number`, `email`, `department_id`, `positionId`, `manager_id`, `branch_id`).
- **Pagination**: Default limit of 20, max limit capped at 100 to prevent memory exhaust on large tenant data sets (50,000+ employees).
- **Hierarchy Traversal Overhead**: `validateManagerHierarchy` traverses manager chains up to default `maxDepth: 25` using single node lookups or in-memory map lookups.

---

## 11. Future Integration

- **TSK-EMP-005 / TSK-EMP-006 (UI Layer)**: The REST API DTOs directly feed the React Employee Directory, filtering controls, and Manager Assignment modal components.
- **Milestone 6 (Attendance Engine)**: Clock-in/clock-out events will query `/api/v1/employees/:id` or inject `EmployeeService` for validation of active employment status.

---

## 12. Open Questions & Architectural Notes

- *Q1: Should employee creation optionally auto-provision a platform user account (`userId`)?*  
  *Answer*: The API contract supports an optional `userId` payload field. Account linking can occur at creation or via a dedicated update endpoint.

---
