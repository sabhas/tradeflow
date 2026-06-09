# TradeFlow

Desktop distribution management application for businesses. Built with Electron, React, Express, and PostgreSQL.

## Architecture

- **apps/desktop** – Electron main process + React renderer (Vite)
- **apps/api** – Express.js REST API (TypeScript)
- **packages/db** – TypeORM entities, migrations, and seed
- **packages/shared** – Shared TypeScript types, constants, and Zod validation

## Prerequisites

- **Node.js** 18+
- **PostgreSQL** 14+
- **pnpm** 9+

## Setup

### 1. Install dependencies

```bash
pnpm install
```

### 2. Database setup

Create a PostgreSQL database:

```bash
createdb tradeflow
```

Or with `psql`:

```sql
CREATE DATABASE tradeflow;
```

### 3. Environment variables

Create `apps/api/.env`:

```env
PORT=3001
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/tradeflow
JWT_SECRET=your-secret-key-change-in-production
```

Create `apps/desktop/.env` (optional, for custom API URL):

```env
VITE_API_URL=http://localhost:3001
```

### 4. Run migrations

```bash
pnpm db:migrate
```

Revert the most recently applied migration:

```bash
pnpm db:migrate:revert
```

Revert multiple migrations:

```bash
MIGRATION_REVERT_STEPS=2 pnpm db:migrate:revert
```

### 5. Seed initial data (roles, permissions, admin user)

```bash
pnpm db:seed
```

Default admin credentials:

- **Email:** admin@tradeflow.local
- **Password:** admin123

## Docker (API + database)

Run PostgreSQL, migrations, seed, and the API in containers:

```bash
cp .env.docker.example .env   # optional; compose has sensible defaults
# Edit JWT_SECRET in .env before any non-local use
pnpm docker:up
```

| Service    | URL                            |
| ---------- | ------------------------------ |
| API        | http://localhost:3001          |
| Swagger    | http://localhost:3001/api-docs |
| PostgreSQL | localhost:5432                 |

Default admin (after seed): `admin@tradeflow.local` / `admin123`

Stop and remove containers:

```bash
pnpm docker:down
```

Remove containers and database volume:

```bash
pnpm docker:reset
```

After the first successful start, set `RUN_SEED=false` in `.env` so rebuilds do not re-run the full seed.

Run the **Electron desktop app** on the host against the containerized API:

```env
VITE_API_URL=http://localhost:3001
```

Then `pnpm dev:desktop` in a separate terminal while `pnpm docker:up` is running.

## Development

### Run API

```bash
pnpm dev:api
```

API runs at http://localhost:3001

### Run desktop app

In a separate terminal:

```bash
pnpm dev:desktop
```

This starts Vite dev server and Electron. The React app loads from `http://localhost:5173` in dev.

### Health check

```bash
curl http://localhost:3001/health
```

## API Endpoints

| Method | Path        | Description                                        |
| ------ | ----------- | -------------------------------------------------- |
| GET    | /health     | API and DB status                                  |
| POST   | /auth/login | Login (email, password) → JWT + user + permissions |
| GET    | /auth/me    | Current user + permissions (protected)             |
| PATCH  | /auth/me    | Update profile (protected, audited)                |
| GET    | /audit-logs | List audit logs (Admin only)                       |

## Optional: Cloud Sync Design (future)

The following is documented for later implementation:

1. **Syncable data:** Full DB export or selected entities (e.g. products, customers, sales).
2. **Export format:** Encrypted bundle or JSON; include schema version for compatibility.
3. **Flow:** User selects provider (Google Drive, OneDrive), triggers export/upload; optional scheduled backups.
4. **Multi-branch:** `branch_id` on business tables; all queries scoped by branch; cloud sync can be per-branch or full backup.

## Tech stack

- **Desktop:** Electron
- **Frontend:** React 18, TypeScript, Tailwind CSS, Redux (RTK), TanStack Query, React Router
- **Backend:** Node.js, Express.js, TypeScript
- **ORM:** TypeORM
- **Database:** PostgreSQL
- **Auth:** JWT, bcrypt
