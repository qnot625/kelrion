# Klerion Company Console

The Klerion Company Console is the first production frontend for the Klerion administrative operations platform. It was ported from the initial Figma Make prototype, then upgraded into a repository-ready React application.

## Included in this milestone

- Responsive enterprise application shell
- Mobile navigation drawer and collapsible desktop sidebar
- Global command palette (`Ctrl/Cmd + K`)
- API-aware organisation sign-up and sign-in
- Persistent live or demo sessions
- Interactive demo mode for modules that do not yet have backend APIs
- Polished views for dashboard, appointments, queue, users, recruitment, and audit
- Structured implementation-foundation views instead of empty placeholders
- Accessible focus states, skip link, reduced-motion support, and responsive authentication

## Run locally

From `apps/web`:

```bash
corepack enable
pnpm install
pnpm dev
```

The development server runs on `http://localhost:5173` and proxies `/api/*` to `http://localhost:3000` by default.

Run the backend separately from the repository root:

```bash
npm run dev
```

## Environment

Copy `.env.example` to `.env.local` when the defaults are not suitable.

- `VITE_API_BASE_URL`: browser-facing API prefix; defaults to `/api`
- `KLERION_API_ORIGIN`: Vite development proxy target; defaults to `http://localhost:3000`

## Current integration boundary

Authentication is connected to the existing tenant and identity endpoints:

- `POST /tenants`
- `POST /auth/signup`
- `POST /auth/login`

The API client also supports the current appointment, user-role, and audit endpoints. Appointments, user roles, and audit events use the live API when authenticated. Dashboard, queue, and recruitment data remain clearly labelled representative data until their domain endpoints are implemented.

## Validation

```bash
pnpm typecheck
pnpm lint
pnpm build
```
