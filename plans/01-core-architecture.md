# Feature Plan: Core Architecture (Foundation)

**Phase:** 1 (MVP)  
**Depends on:** None (first to implement)  
**Tech:** Electron, Node.js, Express.js, TypeScript, TypeORM, PostgreSQL, React, Redux, TanStack Query, Tailwind CSS

---

## 1. Objective

Establish the desktop app structure, backend API, database access, authentication, RBAC, and audit logging so all other features can be built on a consistent foundation.

---

## 2. Scope

### 2.1 Desktop app structure

- **Monorepo layout**
  - `apps/desktop` – Electron main + renderer (React)
  - `apps/api` – Express.js REST API (TypeScript)
  - `packages/db` – TypeORM entities, migrations, and data source config
  - `packages/shared` – shared TypeScript types, constants, and validation (e.g. Zod)
- **Electron**
  - Main process: start/stop API or connect to it; IPC for app lifecycle, window controls
  - Renderer: React app; load from `localhost` API or bundled API in dev
- **Modular domains** – Each feature (Inventory, Sales, Accounting, etc.) has its own routes, services, and entities; shared auth and audit.

### 2.2 Localhost-only (no offline handling)

- The app and API run on the same machine; the React frontend talks to the Express API over localhost. PostgreSQL runs locally. Everything is on one system—no "user is offline" scenario.
- TanStack Query is used for API data with `staleTime` and `gcTime` for caching and performance only.
- No offline detection, offline banner, or mutation queue (localhost-only).

### 2.3 Optional cloud sync (very low priority)

- **Goal:** Allow backup/sync of data to an external service (e.g. Google Drive, One Drive). Optional; implement at the end.
- **Architecture phase (design only):** Document so it can be added later: (1) which data is syncable (e.g. full DB export or selected entities); (2) export format (e.g. encrypted bundle or JSON); (3) placeholder for a future "Sync to cloud" flow (user picks provider, triggers export/upload). No implementation in Phase 1–2.
- Multi-branch: `branch_id` on business tables; all queries scoped by branch; cloud sync can be per-branch or full backup.

### 2.4 Role-based access control (RBAC)

- **Roles:** Admin, Accountant, Sales, Storekeeper.
- **Model:** `users`, `roles`, `permissions`; many-to-many user–role; permission = resource + action (e.g. `inventory:write`, `sales:create`).
- **Backend:** Middleware on every protected route that checks permission from JWT/session.
- **Frontend:** Hide/disable menus and buttons based on user permissions (from Redux or API).

### 2.5 Audit

- **Table:** `audit_log` (id, user_id, action, entity, entity_id, old_value, new_value, created_at). Append-only.
- **Middleware:** After successful mutation, log entity name, id, and old/new (or delta) for configured entities.

---

## 3. Tech stack (this feature)

| Item | Choice |
|------|--------|
| Desktop | Electron |
| Frontend | React 18+, TypeScript, Tailwind CSS |
| Client state | Redux (RTK) – auth, app state, permissions |
| Server state | TanStack Query – API cache, mutations |
| Backend | Node.js, Express.js, TypeScript |
| ORM | TypeORM |
| Database | PostgreSQL |
| Auth | JWT (access + optional refresh), bcrypt/argon2 for passwords |

---

## 4. Data model (TypeORM entities)

- **User** – id, email, passwordHash, name, branchId?, createdAt, updatedAt, deletedAt?
- **Role** – id, name, description
- **Permission** – id, resource, action (e.g. `inventory`, `write`)
- **UserRole** – userId, roleId (many-to-many)
- **RolePermission** – roleId, permissionId (many-to-many)
- **AuditLog** – id, userId, action, entity, entityId, oldValue (json), newValue (json), createdAt
- **Branch** (optional for Phase 1) – id, name, code; add branchId to User and business tables when multi-branch is enabled

---

## 5. API (Express)

- `POST /auth/login` – email, password → JWT + user + permissions
- `POST /auth/refresh` – refresh token → new access token (optional)
- `GET /auth/me` – current user + permissions (protected)
- `GET /audit-logs` – list with filters (entity, user, date range); Admin only
- Health: `GET /health` – API and DB status

All protected routes use middleware: verify JWT → load user → check permission for route.

---

## 6. Frontend (React + Redux + TanStack Query)

- **Redux store:** auth slice (user, token, permissions), app slice (sidebar, theme, branch).
- **TanStack Query:** useQuery for `/auth/me`, useMutation for login; default client with baseURL to API.
- **Routing:** React Router; protected route wrapper that checks auth and permissions.
- **Layout:** Shell with sidebar (menu items filtered by permission), header (user), main content.
- **Tailwind:** Base styles, layout, and components; design tokens if needed.

---

## 7. Implementation tasks

1. Initialize monorepo (e.g. pnpm workspaces or npm workspaces): `apps/desktop`, `apps/api`, `packages/db`, `packages/shared`.
2. **apps/api:** Express app, TypeScript, env (PORT, DATABASE_URL, JWT_SECRET); TypeORM DataSource using `packages/db`; health route.
3. **packages/db:** TypeORM config; entities User, Role, Permission, UserRole, RolePermission, AuditLog; migrations (initial schema); seed script for roles and permissions.
4. **apps/api:** Auth – login (validate password, issue JWT), `/auth/me`; RBAC middleware (requirePermission(resource, action)); apply to sample protected route.
5. **apps/api:** Audit middleware – intercept successful writes; log to AuditLog (entity, entityId, old/new); make it configurable per route/entity.
6. **apps/desktop:** Electron main (create window, load React; optionally start API from main or assume API runs separately). Renderer: React + Vite (or CRA), Tailwind, React Router.
7. **apps/desktop:** Redux store (auth, app); login page; call login API via TanStack Query mutation; store token and user in Redux; set Authorization header for subsequent requests.
8. **apps/desktop:** Protected route and layout; sidebar menu items by permission; logout.
9. **apps/desktop:** TanStack Query default options (staleTime, gcTime, retry) for API requests.
10. Document: how to run API and desktop in dev; env vars; DB setup (PostgreSQL + run migrations). Document optional cloud sync design (syncable data, export format, future "Sync to cloud" flow) for later implementation.

---

## 8. Acceptance criteria

- [ ] Monorepo builds; API starts and connects to PostgreSQL; desktop opens and loads React.
- [ ] Login with valid credentials returns JWT and user; invalid credentials return 401.
- [ ] Protected route without token returns 401; with token and correct permission returns data.
- [ ] Audit log entry created when a configured entity is created/updated.
- [ ] Frontend shows sidebar and content; menu items respect permissions; logout clears token and redirects to login.
- [ ] TanStack Query caches API data for performance; no offline-specific UI (localhost-only).

---

## 9. References

- Main plan: [.cursor/plans/tradeflow_distribution_app_bd057f3f.plan.md](.cursor/plans/tradeflow_distribution_app_bd057f3f.plan.md) – Part B § 1 (Core Architecture).
