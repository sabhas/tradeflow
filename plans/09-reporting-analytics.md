# Feature Plan: Reporting & Analytics

**Phase:** 1 (MVP) – core reports; Phase 2–3 – dashboards, more reports  
**Depends on:** [01-core-architecture.md](01-core-architecture.md), [03-inventory-management.md](03-inventory-management.md), [04-sales-invoicing.md](04-sales-invoicing.md), [05-purchase-management.md](05-purchase-management.md), [06-accounting-finance.md](06-accounting-finance.md)  
**Tech:** Express, TypeORM, PostgreSQL, React, TanStack Query, Tailwind; Recharts (or similar); ExcelJS, PDFKit or react-pdf

---

## 1. Objective

Provide operational and financial reports with date range and filters; export to Excel and PDF; Phase 2–3: dashboards with KPIs and charts (sales trend, inventory health, receivables/payables).

---

## 2. Scope

### 2.1 Operational reports (Phase 1)

- **Daily sales** – Invoices grouped by day; filters: customer, warehouse; columns: date, count, total amount.
- **Stock movement** – From inventory_movements; filters: product, warehouse, date range; columns: date, product, type, qty, ref.
- **Purchase vs sales** – Compare PO/GRN quantities or values to invoice quantities/values in period (Phase 2).
- **Fast-moving items** – Products by quantity or value sold in period; sort and filter.

### 2.2 Financial reports (Phase 1)

- **Trial balance, P&L, Balance sheet** – See [06-accounting-finance.md](06-accounting-finance.md); exposed under Reporting UI with export.
- **Profit by product** – From invoice lines (revenue) and COGS (from inventory costing when available); margin % (Phase 2 if costing done).
- **Profit by customer** – Revenue and margin by customer (Phase 2).
- **Expense analysis** – From P&L expense accounts; group by account or category.
- **Tax summaries** – See [07-tax-management.md](07-tax-management.md).

### 2.3 Dashboards (Phase 2–3)

- **KPIs:** Today’s sales, month-to-date sales, receivables total, payables total, low-stock count.
- **Charts:** Sales trend (daily/weekly); inventory value over time; aging (receivables/payables) pie or bar.
- **Monthly comparison** – This month vs last month (or same month last year).

---

## 3. Data sources

- **Invoices / InvoiceLine** – sales reports, profit by product/customer (with COGS when available).
- **InventoryMovement, StockBalance** – stock movement, current stock, low stock.
- **JournalLine, Account** – trial balance, P&L, balance sheet (via Accounting module).
- **ReceiptAllocation, SupplierPaymentAllocation** – aging (receivables from Invoice minus Receipt allocations; payables from SupplierInvoice minus Payment allocations).
- **Purchase orders / GRN / Supplier invoices** – purchase vs sales, supplier reports.

---

## 4. API (Express)

- **Reports (reuse or wrap existing):**
  - GET /reports/daily-sales?dateFrom=&dateTo=&customerId=&warehouseId=
  - GET /reports/stock-movement?dateFrom=&dateTo=&productId=&warehouseId=
  - GET /reports/fast-moving?dateFrom=&dateTo=&limit=
  - GET /reports/trial-balance, /reports/profit-loss, /reports/balance-sheet (Accounting)
  - GET /reports/tax-collected, /reports/tax-paid, /reports/tax-summary (Tax)
  - GET /reports/receivables-aging, /reports/payables-aging (or under /customers/aging, /suppliers/aging)
  - GET /reports/profit-by-product?dateFrom=&dateTo= (Phase 2)
  - GET /reports/profit-by-customer?dateFrom=&dateTo= (Phase 2)
- **Dashboard (Phase 2–3):**
  - GET /reports/dashboard/kpis?date= (today sales, MTD sales, receivables, payables, low-stock count)
  - GET /reports/dashboard/sales-trend?dateFrom=&dateTo=&groupBy=day|week
  - GET /reports/dashboard/inventory-value?asOfDate=
  - GET /reports/dashboard/aging-summary (receivables/payables buckets)

All report endpoints support branchId from auth; pagination where appropriate.

---

## 5. Frontend (React)

- **Report list** – Sidebar or page listing report names (Operational, Financial, Tax, etc.); click opens report with parameter form (date range, customer, warehouse, etc.).
- **Report view** – Table (and optional chart where useful); “Export to Excel” and “Export to PDF” buttons; use shared export utilities (ExcelJS, PDF).
- **Dashboard (Phase 2–3):** Single page with KPI cards and charts (Recharts); data from dashboard APIs; refresh via TanStack Query.

Use TanStack Query for all report and dashboard APIs; cache with staleTime to avoid refetch on every tab switch. Tailwind for layout and cards.

---

## 6. Export

- **Excel:** Use ExcelJS in API or frontend: build workbook from report data; return file download. Or generate on server and stream.
- **PDF:** Use PDFKit (server) or react-pdf (client) for table/chart; reuse invoice template approach if applicable. Consistent header/footer (company name, report name, date range).

---

## 7. Implementation tasks

1. Implement or aggregate daily-sales, stock-movement, fast-moving APIs (query Invoice, InventoryMovement); add to report router.
2. Expose trial balance, P&L, balance sheet, tax reports, and aging under /reports with consistent response shape; add export helpers (Excel, PDF).
3. Frontend: report list and report runner page (params + table + export buttons); reuse for each report type.
4. (Phase 2) Profit by product/customer (with COGS from inventory costing); expense analysis report.
5. (Phase 2–3) Dashboard KPIs and sales-trend/inventory-value/aging APIs; dashboard page with Recharts; auto-refresh or manual refresh.
6. Permissions: reports:read for all report endpoints; optionally reports:export for export.

---

## 8. Acceptance criteria

- [ ] Daily sales, stock movement, and fast-moving reports return correct data for date range and filters; export to Excel and PDF works.
- [ ] Financial and tax reports are accessible from Reporting module and exportable.
- [ ] (Phase 2–3) Dashboard shows KPIs and charts; data matches underlying reports.

---

## 9. References

- Main plan: Part B § 9 (Reporting & Analytics). Accounting: [06-accounting-finance.md](06-accounting-finance.md). Tax: [07-tax-management.md](07-tax-management.md).
