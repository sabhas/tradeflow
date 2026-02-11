# Feature Plan: Scalability & Future Features

**Phase:** Design now; implement in Phase 2–3 and beyond  
**Depends on:** [01-core-architecture.md](01-core-architecture.md)  
**Tech:** Same stack (Express, TypeORM, PostgreSQL, React, etc.); design for multi-tenant and API reuse

---

## 1. Objective

Ensure the codebase and data model support multi-company/multi-branch from day one; document extension points for mobile companion app, web dashboard, AI/OCR, and third-party integrations so they can be added without large rewrites.

---

## 2. Scope

### 2.1 Multi-company / multi-branch

- **Model:** Every business entity has `branchId` (or `companyId`); user is assigned to one or more branches; current branch in session/Redux.
- **Queries:** All list and read APIs filter by branchId (from JWT or query param); writes set branchId from context.
- **UI:** Branch switcher in header (if user has multiple branches); reports and masters scoped to current branch.
- **Sync:** Optional sync service for cross-branch or head-office reporting; same API with branch filter.

### 2.2 Mobile companion app (future)

- **Scope:** View stock, create simple sale (invoice), view customer balance; sync via same REST API.
- **Design:** Stateless API; JWT auth; same permissions; mobile app (React Native or PWA) consumes existing endpoints. Optional: lighter “mobile” response shape or GraphQL later.
- **Offline:** Mobile can cache critical data and queue mutations; sync when online (same pattern as desktop Phase 2).

### 2.3 Web dashboard (future)

- **Scope:** Same React app built for Electron can be deployed as web app; read-only or light operations (e.g. view reports, approve requests).
- **Design:** No code duplication; build once, deploy to Electron (desktop) and static host (web). API already HTTP; CORS and auth (JWT) work for web. Environment variable for “web” vs “desktop” if needed for deep links or auto-updates.

### 2.4 AI and OCR (Phase 3+)

- **Demand forecasting:** Design: product and warehouse have history (from InventoryMovement and InvoiceLine); future module can consume this for ML model input; store forecast in new table (productId, warehouseId, date, forecastQty) and show in dashboard.
- **OCR for invoices:** Design: supplier invoice can have attachment (file); future OCR service extracts line items and fills draft supplier invoice; entity supports “source: scan” and raw text for audit.

### 2.5 Integrations (Phase 3)

- **Accounting export:** CSV/Excel format for COA and journal entries; document schema for common packages.
- **POS / Barcode:** Already: product by barcode; extend with webhook or file drop for external POS if needed.
- **E-commerce:** API to push stock levels or pull orders; design webhook endpoint and auth (API key per branch); document in [11-import-export-integration.md](11-import-export-integration.md).

---

## 3. Data model and API design (current)

- **branchId:** Add to User, and to all business tables (Product, Customer, Invoice, JournalEntry, etc.) in initial migrations. Middleware: set branchId from user’s default or from request header/query (e.g. X-Branch-Id).
- **Multi-branch user:** UserBranch (userId, branchId, isDefault); user can switch branch; API accepts branchId in context.
- **Syncable entities:** For Phase 2 sync, add `version` (integer) or `updatedAt` (timestamp) to entities; sync API returns changes since timestamp and accepts batch upserts. Conflict resolution: last-write-wins or merge rules per entity type.

---

## 4. Implementation tasks (design and minimal work now)

1. **Now (Phase 1):** Add `branchId` to all business entities and migrations; in API, set branchId from user (single branch per user for MVP); filter all queries by branchId. Document “multi-branch” in README and this plan.
2. **Phase 2:** Implement UserBranch and branch switcher; allow multiple branches per user; pass branchId in request (header or body) and validate user has access.
3. **Phase 2–3:** Sync API design: GET /sync/changes?since=; POST /sync (batch); idempotency keys; document conflict resolution. Implement if local SQLite replica or cloud backup is required.
4. **Future:** Document in repo: mobile app API usage (same endpoints, pagination, minimal payload); web deployment (build and deploy React to CDN, point to same API). No code change until feature is started.
5. **Future:** Add optional fields for AI/OCR (e.g. SupplierInvoice.attachmentUrl, ProductForecast table) when building those features; avoid blocking current scope.

---

## 5. Acceptance criteria (design)

- [ ] All business tables have branchId; all relevant APIs filter and set branchId. Single-branch user works correctly in MVP.
- [ ] (Phase 2) User with multiple branches can switch and see only that branch’s data; sync design doc exists.
- [ ] Extension points (mobile, web, integrations) are documented; no breaking changes required when adding them.

---

## 6. References

- Main plan: Part B § 13 (Scalability & Future Features). Core: [01-core-architecture.md](01-core-architecture.md). Import/Export: [11-import-export-integration.md](11-import-export-integration.md).
