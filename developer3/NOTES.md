# Developer 3 Engineering Scratchpad & Notes

This scratchpad contains informal operational notes, design reminders, reference links, and reminders for Developer 3.

---

## Technical Reminders

1. **Multi-Tenancy Rule**:
   - Always verify that `tenant_id` is passed as the first parameter to repository search/insert methods.
   - Example Drizzle pattern: `.where(and(eq(employees.tenantId, tenantId), eq(employees.id, id)))`.

2. **Audit Logging Integration**:
   - Call platform audit log service on all state mutations:
     - `employee.created`
     - `employee.placement_changed`
     - `attendance.clocked_in`
     - `attendance.clocked_out`
     - `attendance.correction_approved`

3. **Offline Punch Sync**:
   - Client UI must persist punch events to `localStorage` key `klerion_offline_punches` before firing HTTP POST.
   - Upon receiving `200 OK` or `207 Multi-Status` from `/api/v1/attendance/sync`, purge successfully acknowledged `idempotencyKey` items from local storage.

4. **Permissions Check Reference**:
   - `employees:read` -> View directory and profiles
   - `employees:write` -> Create/edit employee record
   - `employees:manage` -> Modify department placements and assign managers
   - `attendance:read` -> View timesheets and summaries
   - `attendance:punch` -> Clock in / out / break
   - `attendance:manage` -> Review and approve time corrections
