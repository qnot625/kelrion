# Klerion Developer-1 Workspace Engineering OS

Welcome to the **Developer-1 Workspace Engineering Operating System**. This workspace is a highly synchronized, enterprise-grade documentation ecosystem designed for **Developer 1 (Senior Staff Software Engineer / Tech Lead / Integration Maintainer)**. 

It serves as the absolute source of truth for the **Branch Flow Bounded Context** inside the Klerion monorepo. It manages tasks, architectural context, granular checklists, known issues, progress logging, and local-to-remote mapping inside the AI Studio environment.

---

## 🏗️ 1. Workspace Ecosystem Architecture

The documents in this directory do not live in isolation. They are designed as a fully integrated, bi-directionally traceable **Engineering Operating System**:

```text
               ┌────────────────────────────────────────────────────────┐
               │                        README.md                       │
               │            (System Index & 5-Minute Onboarding)         │
               └───────────┬────────────────────────────────┬───────────┘
                           │                                │
                           ▼                                ▼
               ┌──────────────────────┐          ┌──────────────────────┐
               │      CONTEXT.md      │          │ IMPLEMENTATION_MAP.md│
               │  (Architecture, DB,  │          │ (Task Dependencies,  │
               │   Ownership Boundaries)          │  Contracts, Milestones)
               └───────────┬──────────┘          └──────────┬───────────┘
                           │                                │
                           ▼                                ▼
               ┌────────────────────────────────────────────────────────┐
               │                        TASKS.md                        │
               │       (9 Vertical-Slice Micro-PR Tasks with DoD)        │
               └───────────────────────────┬────────────────────────────┘
                                           │
                                           ▼
               ┌────────────────────────────────────────────────────────┐
               │                        TODO.md                         │
               │       (Granular, Atomic, Checkbox-by-Checkbox Execution)│
               └───────────────────────────┬────────────────────────────┘
                                           │
                                           ▼
               ┌────────────────────────────────────────────────────────┐
               │                      PROGRESS.md                       │
               │       (Engineering Journal & Blocker Tracking Logs)    │
               └───────────────────────────┬────────────────────────────┘
                                           │
                                           ▼
               ┌────────────────────────────────────────────────────────┐
               │                      CHANGELOG.md                      │
               │       (Traceable File Diffs, Risks & API Changes)      │
               └────────────────────────────────────────────────────────┘
```

### The Traceability Loop
1. **Context & Maps (`CONTEXT.md`, `IMPLEMENTATION_MAP.md`)**: Define *where* we operate, the rules we must obey, and the *sequence* of execution.
2. **Task Board (`TASKS.md`)**: Houses the high-level roadmap, business justifications, and strict verification criteria (**Definition of Done**).
3. **Execution Checklist (`TODO.md`)**: Translates high-level tasks into atomic, single-commit checkboxes.
4. **Active Logging (`PROGRESS.md`)**: Records the temporal, chronological history of engineering sessions, architectural pivot points, and blockers.
5. **Release Log (`CHANGELOG.md`)**: Provides a meticulous file-level diff ledger highlighting contract modifications, risks, and local-to-remote safety statuses.

---

## 📂 2. Documentation Directory Map

| Document | Purpose | Audience | Status |
| :--- | :--- | :--- | :--- |
| **`README.md`** | 5-minute onboarding and master directory of the Workspace OS. | Onboarding Engineers / AI Agents | 🟢 Optimized |
| [**`CONTEXT.md`**](CONTEXT.md) | Living codebase architecture context, folder rules, DB layouts, and contracts. | Developers / AI Refactoring | 🟢 Optimized |
| [**`IMPLEMENTATION_MAP.md`**](IMPLEMENTATION_MAP.md) | Task dependency graph, milestone schedule, and contract/event flows. | Tech Lead / PMs | 🟢 Optimized |
| [**`TASKS.md`**](TASKS.md) | Deep breakdown of the 9 scoped tasks, requirements, and comprehensive DoD. | Engineers / PR Reviewers | 🟢 Optimized |
| [**`TODO.md`**](TODO.md) | Granular, atomic, order-enforced implementation checkboxes. | Active Developer | 🟢 Optimized |
| [**`PROGRESS.md`**](PROGRESS.md) | High-fidelity engineering journal (no storytelling, data-focused logging). | Tech Lead / Audit | 🟢 Optimized |
| [**`CHANGELOG.md`**](CHANGELOG.md) | Rigorous file-level diff and migration safety ledger. | DevOps / Git Maintainers | 🟢 Optimized |
| [**`KNOWN_ISSUES.md`**](KNOWN_ISSUES.md) | Audited ledger tracking technical debt, severities, risks, and workarounds. | SREs / Core Maintainers | 🟢 Optimized |
| [**`ARCHITECTURE_NOTES.md`**](ARCHITECTURE_NOTES.md) | Purely educational personal notebook detailing modern enterprise paradigms. | Personal Learning | 🟢 Optimized |

---

## 🔒 3. Workspace Engineering Principles

Developer 1 operates under a strict, professional engineering framework:

1. **Strict Context Boundaries**: We do not touch modules owned by other developers (such as workforce management or queue engines). Any interaction must go through published contracts in `CONTEXT.md`.
2. **WASM-Based Fast Testing**: Integration tests are written to run in-memory via virtual **PGlite** clients to ensure sub-second validation loops without heavy Docker overhead.
3. **Traceable Git Discipline**: Commits should map 1:1 to atomic items in `TODO.md`, and all changes must be logged transparently inside `CHANGELOG.md`.
4. **Anti-Slop UX Mandates**: Frontend features must strictly reject visual templates (no nesting cards inside cards, no warm-cream glow shadows, mathematically calculated nested border-radii, and precise high-contrast font scales).
5. **Tenant Isolation**: Every database query must be guarded with tenant-context isolation to guarantee data sovereignty.

---

## 🚦 4. 5-Minute Developer Onboarding Protocol

Welcome aboard! Follow this step-by-step checklist to start working in this workspace:

- [ ] **Step 1: Read the Context**: Review [**`CONTEXT.md`**](CONTEXT.md) to understand Klerion's physical folder layout, database schemas, and shared contracts.
- [ ] **Step 2: Trace the Flow**: Inspect [**`IMPLEMENTATION_MAP.md`**](IMPLEMENTATION_MAP.md) to see the critical path of tasks and how the Branch Flow context unfolds.
- [ ] **Step 3: Pinpoint the Current Task**: Check [**`PROGRESS.md`**](PROGRESS.md) to find the active session and the current task.
- [ ] **Step 4: Execute the Code Checklist**: Open [**`TODO.md`**](TODO.md) at the target task section, follow the atomic checkboxes, and execute.
- [ ] **Step 5: Verify via DoD**: Run `npm run lint` and `npm run build` to confirm your vertical slice passes the rigorous checklists in [**`TASKS.md`**](TASKS.md).
- [ ] **Step 6: Update Logs**: Log your accomplishments in [**`PROGRESS.md`**](PROGRESS.md) and record the exact file diffs inside [**`CHANGELOG.md`**](CHANGELOG.md).
