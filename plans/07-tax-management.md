# Feature Plan: Tax Management

**Phase:** 1 (MVP) – setup and calculation; Phase 2 – tax reports and export  
**Depends on:** [01-core-architecture.md](01-core-architecture.md), [02-master-data-management.md](02-master-data-management.md)  
**Tech:** Express, TypeORM, PostgreSQL, React, TanStack Query, Tailwind; ExcelJS/PDF for export

---

## 1. Objective

Centralize tax setup (rates, inclusive/exclusive) and calculation so Sales and Purchase use consistent logic; provide tax reporting (collected vs paid, period-wise, audit-ready) and export to Excel/PDF.

---

## 2. Scope

### 2.1 Tax setup

- **Tax profiles** (in masters) – name, rate (%), isInclusive, region? (for future). Used on products and customers; can override at invoice line level.
- **Calculation:** Given line amount and tax profile: if inclusive, base = amount / (1 + rate/100), tax = amount - base; if exclusive, base = amount, tax = amount * (rate/100). Round per settings.

### 2.2 Tax reporting

- **Collected:** From invoice lines (sales) – tax amount by tax profile and period.
- **Paid:** From purchase/supplier invoice lines – tax amount by tax profile and period.
- **Summary:** Tax collected vs tax paid by period; audit breakdown (which invoices/lines contributed).
- **Export:** Excel and PDF (reuse report export from Reporting plan).

---

## 3. Data model

- **TaxProfile** – (in Master Data) id, name, rate, isInclusive, region?, branchId.
- Tax amounts are stored on **InvoiceLine**, **SupplierInvoiceLine** (and optionally QuotationLine, SalesOrderLine). No separate tax ledger required if we derive reports from these.

---

## 4. Shared tax calculation

- **Location:** `packages/shared` or `apps/api` service.
- **Function:** `computeLineTax(amount, taxProfile, options?: { roundingMode })` → { baseAmount, taxAmount, totalAmount }.
- **Usage:** Sales and Purchase modules call this when building invoice/purchase lines; store baseAmount (or unit price) and taxAmount on line.

---

## 5. API (Express)

- **Tax profiles:** CRUD in Master Data (see [02-master-data-management.md](02-master-data-management.md)).
- **Reports:**  
  - `GET /reports/tax-collected?dateFrom=&dateTo=&taxProfileId=` – list of invoice lines (or grouped by tax profile) with tax amount.  
  - `GET /reports/tax-paid?dateFrom=&dateTo=&taxProfileId=` – list of supplier invoice lines with tax amount.  
  - `GET /reports/tax-summary?dateFrom=&dateTo=` – aggregated collected vs paid by tax profile; optional breakdown by document.

---

## 6. Frontend (React)

- **Tax profiles:** Managed in Settings or Masters (see [02-master-data-management.md](02-master-data-management.md), [12-settings-customization.md](12-settings-customization.md)).
- **Tax reports:** Under Reporting: “Tax collected”, “Tax paid”, “Tax summary”; date range and tax profile filters; table and export to Excel/PDF.

---

## 7. Implementation tasks

1. Implement shared `computeLineTax` and use in Sales invoice line and Purchase supplier invoice line calculation; ensure stored tax amounts are consistent.
2. Add tax report queries (from InvoiceLine and SupplierInvoiceLine, join TaxProfile); APIs for collected, paid, summary.
3. Add tax report screens and export (Excel/PDF) reusing report layout and export from Reporting module.
4. Optional: region-based tax (filter TaxProfile by region); document in plan for future (e.g. VAT in GCC).

---

## 8. Acceptance criteria

- [ ] Invoice and supplier invoice lines show correct tax (inclusive/exclusive) using tax profile.
- [ ] Tax collected and tax paid reports match line-level data; summary shows totals by tax profile and period.
- [ ] Reports are exportable to Excel and PDF.

---

## 9. References

- Main plan: Part B § 7 (Tax Management). Masters: [02-master-data-management.md](02-master-data-management.md). Reporting: [09-reporting-analytics.md](09-reporting-analytics.md).
