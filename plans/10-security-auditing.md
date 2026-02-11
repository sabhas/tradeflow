# Feature Plan: Security, Controls & Auditing

**Phase:** 1 (MVP) – RBAC, audit, soft delete; Phase 2 – approval workflows, backups  
**Depends on:** [01-core-architecture.md](01-core-architecture.md)  
**Tech:** Express, TypeORM, PostgreSQL, React, Redux, Tailwind

---

## 1. Objective

Harden the application: role-based permissions on every API and key UI action; append-only audit logs; soft delete and recycle bin; optional approval workflows for sensitive operations; data encryption and backup strategy.

---

## 2. Scope

### 2.1 RBAC (from Core Architecture)

- **Roles:** Admin, Accountant, Sales, Storekeeper.
- **Permissions:** resource:action (e.g. inventory:write, sales:invoices:post). Middleware on API; frontend hides/disables by permission.
- **Coverage:** All feature plans reference permissions; ensure every mutation and sensitive read is protected.

### 2.2 Audit

- **Audit log:** Entity, entityId, action (create/update/delete), oldValue (JSON), newValue (JSON), userId, createdAt. Append-only; no delete.
- **Coverage:** Core middleware logs configured entities (products, customers, invoices, journal entries, etc.). Optionally log read of sensitive data (e.g. P&L) if required.

### 2.3 Soft delete and recycle bin

- **Soft delete:** Critical entities have `deletedAt`; all normal queries filter WHERE deletedAt IS NULL. “Delete” in UI sets deletedAt.
- **Recycle bin:** Admin-only list of soft-deleted records (products, customers, invoices draft, etc.); “Restore” clears deletedAt. Optional “Purge” after X days (hard delete) per policy.

### 2.4 Approval workflows (Phase 2)

- **Use cases:** Stock adjustment above threshold; journal entry above threshold; credit limit override.
- **Model:** approval_requests (entity, entityId, requestedBy, approvedBy?, status, requestedAt, approvedAt); workflow: create request → approver sees list → approve/reject → entity status updated.
- **Permissions:** e.g. inventory:approve, accounting:approve.

### 2.5 Data encryption and backups

- **Passwords:** bcrypt or argon2; never store plain text.
- **Transit:** HTTPS (TLS) for API and Electron loading.
- **At rest:** PostgreSQL TDE or disk-level encryption per environment; document for deploy.
- **Backups:** Scheduled pg_dump or managed backup; optional export to S3/Azure (Phase 3); restore procedure documented.

---

## 3. Data model (additions)

- **AuditLog** – (Core) id, userId, action, entity, entityId, oldValue (jsonb), newValue (jsonb), createdAt.
- **ApprovalRequest** (Phase 2) – id, entityType, entityId, requestedBy, status (pending/approved/rejected), approvedBy?, approvedAt?, reason?, branchId, createdAt.
- **Soft delete:** Add deletedAt to Product, Customer, Supplier, Invoice (draft only?), JournalEntry (draft only?), etc. Filter in TypeORM with @DeleteDateColumn() or custom scope.

---

## 4. API (Express)

- **Audit:** GET /audit-logs?entity=&entityId=&userId=&dateFrom=&dateTo= (Admin only); paginated.
- **Recycle bin:** GET /recycle-bin?entity= (list soft-deleted by entity type), POST /recycle-bin/:entity/:id/restore (Admin), optional POST /recycle-bin/:entity/:id/purge (Phase 2).
- **Approval (Phase 2):** GET /approval-requests (list pending for current user or all for Admin), POST /approval-requests/:id/approve, POST /approval-requests/:id/reject.

---

## 5. Frontend (React)

- **Audit log viewer:** Admin page; filters (entity, user, date); table of audit entries; optional drill-down to old/new diff.
- **Recycle bin:** Admin page; select entity type; list deleted records; Restore button; confirm before restore.
- **Approval (Phase 2):** “Pending approvals” widget or page; list requests; Approve/Reject with optional reason.

---

## 6. Implementation tasks

1. Ensure RBAC middleware is applied to all routes per feature; add missing permissions to seed; frontend permission checks on menus and buttons.
2. Extend audit middleware to all entities that need logging; ensure no PII in logs if required by policy; add GET /audit-logs and UI.
3. Add deletedAt to designated entities; implement soft delete in repositories/services; recycle bin API and Admin UI (list + restore).
4. (Phase 2) ApprovalRequest entity and workflow: create request when e.g. adjustment &gt; threshold; approval/reject endpoints; notify approver (in-app list; email optional later).
5. Document: password hashing, HTTPS, encryption at rest, backup schedule and restore steps; optional backup script (pg_dump + upload to S3).
6. Security review: no secrets in client; token expiry; rate limiting on login (optional).

---

## 7. Acceptance criteria

- [ ] Every protected API requires valid JWT and correct permission; frontend reflects permissions.
- [ ] Audit log records create/update/delete for configured entities; Admin can view and filter logs.
- [ ] Soft-deleted records do not appear in normal lists; Admin can restore from recycle bin.
- [ ] (Phase 2) Approval requests can be created and approved/rejected; entity state updates accordingly.
- [ ] Backup and restore procedure is documented; passwords are hashed; HTTPS used in production.

---

## 8. References

- Main plan: Part B § 10 (Security, Controls & Auditing). Core: [01-core-architecture.md](01-core-architecture.md).
