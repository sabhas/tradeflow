# TradeFlow – Feature Plans

This folder contains **detailed plans for each feature** of the TradeFlow distribution business application. The main high-level plan (tech stack, architecture, phased delivery) is in the project’s plan file (e.g. `.cursor/plans/tradeflow_distribution_app_*.plan.md`).

## Tech stack (summary)

- **Desktop:** Electron  
- **Frontend:** React 18+, TypeScript, Tailwind CSS, Redux (RTK), TanStack Query  
- **Backend:** Node.js, Express.js, TypeScript  
- **Database:** PostgreSQL  
- **ORM:** TypeORM  
- **Auth:** JWT, RBAC (Admin, Accountant, Sales, Storekeeper)

---

## Plan index

| # | Plan | Phase | Description |
|---|------|--------|-------------|
| 01 | [01-core-architecture.md](01-core-architecture.md) | 1 | Monorepo, Electron, Express API, TypeORM, PostgreSQL, JWT, RBAC, audit, offline-first base |
| 02 | [02-master-data-management.md](02-master-data-management.md) | 1 | Product categories, products, UoM, price levels, customers, suppliers, warehouses, salespersons, tax profiles |
| 03 | [03-inventory-management.md](03-inventory-management.md) | 1–2 | Stock movements, balances, opening balance, adjustments; Phase 2: transfers, alerts, costing |
| 04 | [04-sales-invoicing.md](04-sales-invoicing.md) | 1 | Quotation → SO → Invoice, receipts, credit limit, statements, aging |
| 05 | [05-purchase-management.md](05-purchase-management.md) | 2 | PO → GRN → Supplier invoice, supplier payments, statements, aging |
| 06 | [06-accounting-finance.md](06-accounting-finance.md) | 1–2 | COA, journal entries, auto-post from sales/purchase, trial balance, P&L, balance sheet |
| 07 | [07-tax-management.md](07-tax-management.md) | 1–2 | Tax calculation, tax profiles, tax collected/paid reports, export |
| 08 | [08-logistics-distribution.md](08-logistics-distribution.md) | 3 | Routes, delivery runs, delivery notes, proof of delivery, salesperson/route reports |
| 09 | [09-reporting-analytics.md](09-reporting-analytics.md) | 1–3 | Operational and financial reports, export Excel/PDF, dashboards (Phase 2–3) |
| 10 | [10-security-auditing.md](10-security-auditing.md) | 1–2 | RBAC coverage, audit log, soft delete, recycle bin, approval workflows (Phase 2), backups |
| 11 | [11-import-export-integration.md](11-import-export-integration.md) | 1–3 | Export from reports/lists; Phase 2: Excel/CSV import, backup/restore; Phase 3: integration points |
| 12 | [12-settings-customization.md](12-settings-customization.md) | 1–2 | Company profile, financial year, currency/rounding, invoice templates; Phase 2: i18n, notifications |
| 13 | [13-scalability-future.md](13-scalability-future.md) | Design | Multi-branch, mobile/web readiness, AI/OCR and integrations (design only) |

---

## Implementation order (suggested)

1. **01** – Core Architecture (repo, API, DB, auth, RBAC, audit)  
2. **02** – Master Data (products, customers, suppliers, tax, etc.)  
3. **03** – Inventory (movements, balances, opening balance, adjustments)  
4. **04** – Sales & Invoicing (quotations, SO, invoice, receipts, statement/aging)  
5. **06** – Accounting (COA, journals, auto-post, trial balance, P&L, balance sheet)  
6. **09** – Reporting (daily sales, stock movement, financial reports, export)  
7. **07** – Tax (reports and export; calculation already in Sales/Purchase)  
8. **12** – Settings (company, currency, rounding, invoice template)  
9. **10** – Security (audit viewer, recycle bin, backups)  
10. **05** – Purchase (Phase 2)  
11. **11** – Import (Phase 2); **08** – Logistics (Phase 3); **13** – Multi-branch and future (as needed)

Each plan lists **Depends on**, **Implementation tasks**, and **Acceptance criteria** so you can implement and verify feature by feature.
