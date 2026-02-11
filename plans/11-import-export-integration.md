# Feature Plan: Import / Export & Integration

**Phase:** 1 (MVP) – export from reports; Phase 2 – Excel/CSV import, backup/restore; Phase 3 – integrations  
**Depends on:** [01-core-architecture.md](01-core-architecture.md), [02-master-data-management.md](02-master-data-management.md), [09-reporting-analytics.md](09-reporting-analytics.md)  
**Tech:** Express, TypeORM, PostgreSQL, React, TanStack Query, Tailwind; ExcelJS, csv-parse/csv-stringify; Zod for validation

---

## 1. Objective

Allow bulk data import (products, customers, opening balances) from Excel/CSV with validation and error reporting; standardize export (Excel/PDF) from reports and lists; optional backup/restore; document integration points for accounting, POS, and e-commerce (future).

---

## 2. Scope

### 2.1 Data import (Phase 2)

- **Products:** Template (columns: category, sku, barcode, name, unit, costPrice, sellingPrice, etc.); validate each row (Zod or similar); bulk insert in transaction; return success count and list of errors (row number, field, message).
- **Customers:** Template with name, type, contact, creditLimit, paymentTerms, taxProfile; same validate-and-insert pattern.
- **Opening balances:** Template for inventory (product, warehouse, quantity, cost) and/or receivables/payables (customer/supplier, amount); validate and post via existing services (opening balance movement, journal entry).
- **CSV:** Same as Excel where applicable; parse with csv-parse; support encoding (UTF-8).

### 2.2 Export (Phase 1–2)

- **Reports:** Already in Reporting plan – export to Excel and PDF from each report. Reuse ExcelJS and PDF utilities.
- **Lists:** “Export to Excel” on product list, customer list, invoice list, etc.; same columns as table or predefined set.
- **Backup/restore (Phase 2):** Full DB dump (pg_dump) and restore (psql or TypeORM); or “export all data” as JSON/CSV for portability; restore from file (dangerous – document and restrict to Admin).

### 2.3 Integrations (Phase 3 – design only)

- **Accounting software:** Export COA and journal entries (CSV format for import elsewhere); document format.
- **POS / Barcode:** API for product lookup by barcode (GET /products?barcode=); already support barcode in product master and invoice line.
- **E-commerce:** Future: sync orders or stock levels via API; document extension points.

---

## 3. API (Express)

- **Import:**
  - POST /import/products (multipart file: Excel or CSV); validate; return { successCount, errors: [{ row, field, message }] }.
  - POST /import/customers – same.
  - POST /import/opening-balances – file with inventory and/or ledger lines; call inventory and accounting services.
- **Export (list):**
  - GET /export/products?format=xlsx (or generate on server and return file); same for customers, invoices (filter by date/customer).
- **Backup (Phase 2):** POST /admin/backup (trigger pg_dump and return file or store path); GET /admin/backup/list; restrict to Admin. Restore: POST /admin/restore (dangerous – require confirmation and backup of current DB).

---

## 4. Frontend (React)

- **Import:** Page per entity (Products, Customers, Opening balances); “Download template” link; file upload (drag-drop or input); on success show “Imported X rows”; on errors show table of row, field, message. Use TanStack Query mutation for upload.
- **Export:** “Export” button on list pages (Products, Customers, Invoices, etc.); trigger download of Excel (or open in new tab for PDF). Optionally “Export all” with current filters.
- **Backup (Phase 2):** Admin-only page: “Create backup” button; “Download” last backup; “Restore” with confirmation and file upload (if restore from file).

---

## 5. Implementation tasks

1. Define Excel/CSV templates (columns and sample row); document in repo or help.
2. Implement import service: parse Excel (ExcelJS) or CSV; validate each row with Zod (or shared DTO); insert in transaction; collect errors; return result. Use for products and customers first.
3. Implement opening balance import: parse file; call inventory opening-balance API and/or accounting journal entry API; return result.
4. Add POST /import/* endpoints and file upload middleware (e.g. multer); size limit and type check.
5. Add list export endpoints or reuse report export: products, customers, invoices as Excel; ensure branchId filter.
6. (Phase 2) Backup: script or endpoint to run pg_dump; store in local path or upload to S3; restore script documented; restrict to Admin.
7. Document: product lookup by barcode (existing API); accounting export format (CSV structure); future webhook/API for POS and e-commerce.

---

## 6. Acceptance criteria

- [ ] Product and customer import from Excel/CSV validates and inserts rows; errors are reported by row and field.
- [ ] Opening balance import creates inventory and/or accounting entries; errors reported.
- [ ] Export from product and customer lists produces correct Excel file.
- [ ] (Phase 2) Admin can trigger backup and download; restore procedure is documented and safe.

---

## 7. References

- Main plan: Part B § 11 (Import / Export & Integration). Masters: [02-master-data-management.md](02-master-data-management.md). Reporting: [09-reporting-analytics.md](09-reporting-analytics.md).
