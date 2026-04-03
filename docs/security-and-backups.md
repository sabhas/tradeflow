# Security, encryption, and backups

This document summarizes how TradeFlow handles credentials, transport security, data at rest, and disaster recovery. Adjust all values for your environment.

## Passwords and authentication

- User passwords are stored using **bcrypt** (see seed and `apps/api/src/routes/auth.ts`). Never log or return password hashes from the API.
- Sessions use **JWT** access tokens signed with `JWT_SECRET`. Set a long, random secret in production; the default dev secret must not be used in production.
- Token lifetime is controlled with **`JWT_EXPIRES_IN`** (for example `8h` or `7d`). Shorter lifetimes reduce exposure if a token leaks.
- **Login rate limiting:** After repeated failed attempts for the same email, the API returns `429 Too Many Requests` with a `Retry-After` header (see `auth` routes). Tune `LOGIN_MAX_ATTEMPTS` and `LOGIN_WINDOW_MS` in code if needed.

## Transport (HTTPS / TLS)

- Run the API behind a reverse proxy or load balancer that terminates **TLS** (HTTPS). The Electron/desktop client should use `VITE_API_URL` pointing at an `https://` base URL in production.
- Do not ship real `JWT_SECRET` or database credentials inside the desktop bundle; keep secrets on the server and in deployment configuration only.

## Encryption at rest

- PostgreSQL does not encrypt data by default. Use one or more of:
  - **Disk/volume encryption** for the database host (cloud provider managed disks, LUKS, etc.).
  - **PostgreSQL TDE** or enterprise offerings if your compliance regime requires it.
- Audit log rows may contain JSON snapshots of changed fields; restrict database access and backups accordingly.

## Backups

### Recommended schedule

- Take **automated logical backups** (for example nightly `pg_dump`) and retain multiple generations (daily / weekly / monthly) according to your policy.
- Store backup artifacts on **separate** storage from the primary database (different account, region, or medium).

### Example: `pg_dump`

```bash
# Replace connection details; use a dedicated backup role with read-only access if possible.
pg_dump "$DATABASE_URL" -Fc -f "tradeflow-$(date -u +%Y%m%d-%H%M%S).dump"
```

### Restore (custom format)

```bash
pg_restore --clean --if-exists -d "$DATABASE_URL" ./tradeflow-YYYYMMDD-HHMMSS.dump
```

Verify restores regularly in a non-production environment.

## Application-level controls

- **RBAC:** Routes require JWT authentication and permission checks (`resource:action`). The Admin role receives all seeded permissions, including `audit:read` and recycle bin permissions.
- **Audit logs** are append-only at the application layer; do not expose delete APIs for `audit_logs`.
- **Soft delete:** Products, customers, suppliers, draft invoices, and draft manual journal entries use `deleted_at`; normal queries exclude these rows. Admins can list and restore via the recycle bin API and UI.

## Operational checklist (production)

- [ ] Strong `JWT_SECRET` and appropriate `JWT_EXPIRES_IN`
- [ ] HTTPS for all API traffic
- [ ] Database credentials rotated and not committed to git
- [ ] Disk or database encryption enabled per policy
- [ ] Scheduled `pg_dump` (or managed backups) with off-site retention
- [ ] Documented and tested restore procedure
