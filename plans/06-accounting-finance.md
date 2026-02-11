# Feature Plan: Accounting & Finance

**Phase:** 1 (MVP) – COA, double-entry, cash/bank, P&L, trial balance; Phase 2 – full statements, contra, approval  
**Depends on:** [01-core-architecture.md](01-core-architecture.md), [02-master-data-management.md](02-master-data-management.md)  
**Tech:** Express, TypeORM, PostgreSQL, React, Redux, TanStack Query, Tailwind

---

## 1. Objective

Provide double-entry bookkeeping: chart of accounts (COA), journal entries, automatic posting from sales (invoices, receipts) and purchases (supplier invoices, payments), trial balance, profit & loss, and balance sheet. Phase 2: cash flow, contra and adjustment entries, optional approval workflows.

---

## 2. Scope

### 2.1 Chart of accounts

- **Accounts** – code, name, type (asset, liability, equity, income, expense), parentId for hierarchy, isSystem (no delete).
- **Seed:** Default COA with Cash, Bank, Receivable, Payable, Sales, Purchase, Inventory, Tax Payable, etc.

### 2.2 Double-entry

- **Journal entry** – date, reference, description, status (draft/posted).
- **Journal lines** – accountId, debit, credit; constraint: sum(debit) = sum(credit) per entry.
- **Posting:** Only “posted” entries affect account balances; draft can be edited/deleted.

### 2.3 Cash and bank

- **Settings:** Default cash account and bank account (from COA). Receipts and payments post to these + receivable/payable.
- **Sub-ledgers:** Receivable balance = sum of posted invoice amounts minus receipt allocations; Payable = sum of supplier invoice amounts minus payment allocations. Keep in sync with journal (or derive from journals).

### 2.4 Auto-post rules (integration)

- **On invoice post (sales):** Dr Receivable, Cr Sales (by line), Cr Tax Payable (if applicable), Cr/Dr Discount if any.
- **On receipt:** Dr Cash/Bank, Cr Receivable (and link allocation to invoice).
- **On supplier invoice post:** Dr Inventory/Expense, Dr Tax (if recoverable), Cr Payable.
- **On supplier payment:** Dr Payable, Cr Cash/Bank.
- **On inventory adjustment (optional):** Dr/Cr Inventory, Cr/Dr Expense (e.g. loss) or other account per policy.

### 2.5 Financial statements

- **Trial balance:** Sum of journal lines (posted only) by account, for date range; columns: account, debit, credit.
- **P&L:** Income and expense accounts; period (date range); compare periods if needed.
- **Balance sheet:** Asset, liability, equity accounts; as of date.
- **Cash flow (Phase 2):** Operating (from P&L and working capital changes), investing, financing; or simplified cash movement summary.

### 2.6 Payments

- **Customer receipts:** See Sales plan; post Dr Cash/Bank, Cr Receivable.
- **Supplier payments:** See Purchase plan; post Dr Payable, Cr Cash/Bank.
- **Partial payments:** Multiple allocations per receipt/payment; allocation logic (oldest first or user-selected).

---

## 3. Data model (TypeORM)

- **Account** – id, code, name, type (enum), parentId?, isSystem, branchId?, createdAt, updatedAt.
- **JournalEntry** – id, entryDate, reference, description, status (draft/posted), branchId, createdBy, createdAt, updatedAt.
- **JournalLine** – id, journalEntryId, accountId, debit, credit. Constraint in app or DB: SUM(debit)=SUM(credit) per journalEntryId.
- **AccountBalance** (optional) – id, accountId, asOfDate, balance (running total). Can be derived from JournalLine sum instead; use if need fast balance lookup.

Indexes: JournalLine(accountId, journalEntryId), JournalEntry(entryDate, branchId). Unique: Account(code, branchId).

---

## 4. Business rules

- **Post journal entry:** Set status = posted; no edit/delete of posted entry (or only via reversal). Recalculate account balances if using AccountBalance table.
- **Account types:** Used for P&L (income, expense) vs balance sheet (asset, liability, equity). Report grouping by type.
- **Rounding:** Store amounts in fixed decimal (e.g. 2 places); rounding rule from settings when generating entries from invoices.

---

## 5. API (Express)

- **COA:** GET /accounts (tree or flat), POST /accounts, PATCH /accounts/:id (only if not isSystem and no posted lines), GET /accounts/:id/balance?asOf=.
- **Journal entries:** GET /journal-entries (filter by date, status), GET /journal-entries/:id, POST (draft), PATCH (draft only), POST /journal-entries/:id/post, POST /journal-entries/:id/reverse (Phase 2).
- **Reports:** GET /reports/trial-balance?dateFrom=&dateTo=, GET /reports/profit-loss?dateFrom=&dateTo=, GET /reports/balance-sheet?asOfDate=, GET /reports/cash-flow?dateFrom=&dateTo= (Phase 2).

---

## 6. Frontend (React)

- **COA:** Tree or list; add/edit account (code, name, type, parent); prevent delete if has lines or isSystem.
- **Journal entry:** Form with date, ref, description; lines (account, debit, credit); ensure debits = credits; save as draft, post button; list with filter by date and status.
- **Trial balance:** Select date range; table (account code/name, debit, credit); export Excel/PDF.
- **P&L:** Select period; show income and expense groups and net; export.
- **Balance sheet:** Select as-of date; show assets, liabilities, equity; export.
- **Cash flow (Phase 2):** Select period; show sections; export.

Use TanStack Query for reports; Redux for selected period/branch if needed.

---

## 7. Integration

- **Sales module:** When invoice is posted, call accounting service to create journal entry (Receivable, Sales, Tax); when receipt is posted, create entry (Cash, Receivable).
- **Purchase module:** When supplier invoice is posted, create entry (Inventory/Expense, Payable); when payment is posted, create entry (Payable, Cash).
- **Settings:** Company settings hold default cash and bank account IDs; financial year for period locking (Phase 2).

---

## 8. Implementation tasks

1. Add Account, JournalEntry, JournalLine entities; migration; seed default COA (Cash, Bank, Receivable, Payable, Sales, Purchase, Inventory, Tax, etc.).
2. Implement account CRUD and balance query (sum of posted journal lines up to date).
3. Implement journal entry CRUD and post (validate sum debit = sum credit); optional AccountBalance update.
4. Implement trial balance, P&L, balance sheet queries (group by account type, filter by date).
5. Create accounting service used by Sales and Purchase: postInvoice, postReceipt, postSupplierInvoice, postSupplierPayment with correct account IDs from settings.
6. Frontend: COA screen; journal entry form and list; trial balance, P&L, balance sheet report screens with export.
7. (Phase 2) Contra and adjustment entry types; optional approval workflow for journal entries above threshold; cash flow report.

---

## 9. Acceptance criteria

- [ ] COA can be managed; default accounts exist; journal entry must balance before post.
- [ ] Posting invoice creates Dr Receivable, Cr Sales (and tax); posting receipt creates Dr Cash, Cr Receivable.
- [ ] Posting supplier invoice and payment creates correct Payable and Cash entries.
- [ ] Trial balance, P&L, and balance sheet match expected totals and are exportable.

---

## 10. References

- Main plan: Part B § 6 (Accounting & Finance). Sales: [04-sales-invoicing.md](04-sales-invoicing.md). Purchase: [05-purchase-management.md](05-purchase-management.md).
