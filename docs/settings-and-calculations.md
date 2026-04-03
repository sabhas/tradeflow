# Settings: calculations and usage

This document summarizes which **company settings** affect numeric behavior in TradeFlow and where that logic lives.

## Currency, decimals, and rounding

Stored on `company_settings`: `currency_code`, `money_decimals`, `quantity_decimals`, `rounding_mode` (`half_up`, `half_down`, `down`, `up`).

**Where applied**

- **Sales document totals** (quotations, sales orders, invoices): `computeSalesDocumentTotals` in `apps/api/src/services/salesTotals.ts` loads the row via `getCompanySettingsRow`, rounds each line quantity to `quantity_decimals`, computes tax per line, then rounds line base/tax amounts to `money_decimals` using `roundAmountString` in `apps/api/src/utils/rounding.ts`. Header discount and document subtotal, tax, and total use the same rounding.
- **Invoice PDF / print HTML**: `buildInvoicePrintHtml` in `apps/api/src/services/invoiceHtml.ts` formats displayed line amounts and totals with those decimals and shows `currency_code` next to monetary columns.

Values are **not** automatically pushed into unrelated modules (e.g. general ledger postings still use stored invoice totals as persisted).

## Financial year

`financial_year_start_month` and optional `financial_year_label_override` drive the **computed** label returned by `GET /settings` as `currentFinancialYearLabel` (`computeFinancialYearLabel` in `apps/api/src/utils/financialYear.ts`). Report default date ranges can use this in future work; period locking is out of scope for the current MVP.

## Company profile and invoice templates

**Company profile** fields (name, address, tax ID, logo URL, etc.) are used on the **invoice print view** (`buildInvoicePrintHtml`) and should be used for other PDF/report headers as those features adopt a shared helper.

**Invoice templates** (`invoice_templates.config`) toggle sections on the print layout (logo, legal name, tax number, payment terms, notes). Each invoice may set `invoice_template_id`; otherwise the company **default invoice template** is used when creating an invoice.
