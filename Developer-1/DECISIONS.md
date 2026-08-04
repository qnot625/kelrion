# Architecture Decision Records (ADR)

This document tracks technical decisions made during the development of this project, explaining context, options, selections, and trade-offs.

---

## ADR-001: Separation of AI Studio Workspace and Klerion Production Code

### Status
Accepted

### Date
2026-07-31

### Context
Klerion is an enterprise-grade collaborative application. Its original codebase defines `apps/web` as an independent directory outside of npm workspaces to isolate its separate `pnpm` workspace setup. However, the AI Studio preview container relies on a single-point orchestrator (`dev.js` on Port 3000) and standard `npm install` workflows. Previous sessions modified the root workspace config to include `apps/web`, breaking local build instructions and CI filters.

### Options Considered
1. **Option A: Keep the modified workspaces structure** (permanently merging `apps/web` into the root npm workspace).
2. **Option B: Revert the workspaces structure immediately** (which might break some of AI Studio's package installation mechanisms if the container cannot easily find dependencies for build/lint commands).
3. **Option C: Separate the two states clearly** (Keep the workspaces modified in the AI Studio container to allow active dev and building, but isolate and declare it as a workspace-only modification to be discarded before committing to the production repository).

### Decision Taken
**Option C: Separate the two states clearly.**

### Reason
- Respects the original architecture and instructions. Keeping the workspaces merged permanently would violate the rule that `apps/web` is intentionally not an npm workspace.
- Reverting instantly might cause dependency-resolving or build/lint issues within the AI Studio pipeline due to its standard npm execution flow.
- A clean, documented split ensures the app is fully functional in the AI Studio environment while maintaining the absolute integrity of Klerion for local development.

### Trade-offs
- **Pros**: Zero risk of polluting production; standard local environments remain pristine.
- **Cons**: Developer 1 must remember to skip copying the root `package.json` and `dev.js` back to the local repository (this is clearly documented in the handoff and changelog).
