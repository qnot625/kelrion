# Architecture Review: TSK-ATT-006 — Real-time Clock-In / Clock-Out UI Widget & Local Queue Sync

**Task ID**: TSK-ATT-006  
**Task Name**: Real-time Clock-In / Clock-Out UI Widget & Local Queue Sync  
**Milestone**: Milestone 9 — Attendance UI & Clock Controls  
**Reviewer**: Developer 3 (Lead Architect Review)  
**Date**: 2026-08-03  
**Status**: REVIEW APPROVED (DESIGN STAGE)  

---

## Executive Summary

This architecture review evaluates the proposed engineering design for **TSK-ATT-006: Real-time Clock-In / Clock-Out UI Widget & Local Queue Sync** documented in `developer3/design/TSK-ATT-006_DESIGN.md`.

The review confirms that the design strictly adheres to Klerion's domain-driven design standards, respects existing backend API contracts (ATT-003, ATT-004, ATT-005), maintains strict multi-tenant isolation, enforces client-side idempotency, and provides seamless offline capabilities without modifying existing backend services.

---

## 1. Compliance Checklist & Evaluation

| Evaluation Criteria | Requirement Status | Assessment & Notes |
| :--- | :---: | :--- |
| **DDD Compliance** | Met | Frontend component layer consumes REST endpoints strictly. Business rules (state transitions) reflect domain aggregate invariants while allowing local optimistic visual UI updates. |
| **Backend API Contract Alignment** | Met | All planned client endpoints (`/attendance/clock-in`, `/attendance/clock-out`, `/attendance/break-start`, `/attendance/break-end`, `/attendance/sync`) match backend Fastify schemas. |
| **Multi-Tenant Boundary Isolation** | Met | Client queues are scoped per tenant (`klerion_attendance_queue_${tenantSlug}_${employeeId}`), preventing cross-tenant queue leakage. |
| **Idempotency Strategy** | Met | Deterministic idempotency keys (`clk_${eventType}_${employeeId}_${timestamp}`) prevent duplicate backend event insertion on network retries. |
| **Offline Resilience** | Met | `localStorage` queue captures clock actions when offline, sorting events chronologically FIFO for sequential batch sync replay via `POST /attendance/sync`. |
| **Regression Prevention** | Met | Design requires zero modifications to existing backend domain modules, databases, or API routes. |

---

## 2. Technical Risk Analysis & Mitigation Strategies

### Risk 1: Clock Drift Between Client & Server
- **Risk**: A client device with an incorrect system clock could submit event timestamps that conflict with backend aggregate drift checks.
- **Mitigation**: The backend `AttendanceSyncEngine` already enforces maximum future drift thresholds (5 minutes). The frontend UI will display server-acknowledged timestamps upon successful sync and flag drift errors if returned by `/attendance/sync`.

### Risk 2: Out-of-Order Queue Replay
- **Risk**: If local network drops cause events to be enqueued out of sequence, direct replay might trigger backend domain transition errors (`e.g. ClockOut before ClockIn`).
- **Mitigation**: `attendance-queue.ts` forces strict FIFO sorting by recorded ISO timestamp before constructing batch payloads for `POST /attendance/sync`. Furthermore, `AttendanceSyncEngine` on the backend sorts incoming batch events chronologically before processing.

### Risk 3: LocalStorage Storage Limitations
- **Risk**: Browser `localStorage` quota errors could occur if queue grows excessively large due to prolonged offline operations.
- **Mitigation**: Individual queued attendance event payloads are lightweight (~300 bytes). A max queue length limit (e.g., 500 events) will be enforced, and successfully processed items are immediately purged upon receipt of a `200/207` sync response.

---

## 3. Architecture Review Conclusion

The design specification for `TSK-ATT-006` is **APPROVED**. The proposed component hierarchy, hook architecture, queue persistence model, and API client extensions provide a solid foundation for implementation when authorized.

**Final Recommendation**: Proceed to Phase 3 & Phase 4 implementation upon explicit user authorization.
