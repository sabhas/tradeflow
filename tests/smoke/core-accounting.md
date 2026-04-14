# Smoke scenarios — Core accounting (journals & financial reports)

Covers **Journal entries** (`/accounting/journals`) and **Financial reports** (`/accounting/reports`). Use the accounting sub-nav tabs to switch.

---

## Journal entries

### JE-01 — Page loads and register is visible

**Preconditions:** User with `accounting:read`.

| Step | Action | Expected |
|------|--------|----------|
| 1 | Open `/accounting/journals`. | Heading **Journal entries**; section **Journal register** with filter **Status** (All / Draft / Posted), **From**, **To** dates. |
| 2 | Wait for the list. | Either rows with columns **Date**, **Reference**, **Description**, **Lines**, **Status**, **Source**, or empty state **No journal entries for these filters.**, or loading row **Loading journal entries…** then data. |

---

### JE-02 — Filter by status and date range

| Step | Action | Expected |
|------|--------|----------|
| 1 | Set **Status** to **Posted** and a **From** / **To** range that includes known data. | List only shows matching entries (or empty message if none). |
| 2 | Set **Status** back to **All** and widen the date range. | More rows may appear; no crash. |

---

### JE-03 — New journal entry (write permission)

**Preconditions:** User with `accounting:write`; at least two posting accounts exist for debits/credits.

| Step | Action | Expected |
|------|--------|----------|
| 1 | Click **New journal entry**. | Form opens with lines for accounts and debit/credit amounts. |
| 2 | Enter entry **date**, **reference** / **description** as needed; add lines so **total debits = total credits**; save/post per UI (draft vs posted if applicable). | Entry appears in **Journal register** with correct **Status**; line detail shows account codes/names and **Dr** / **Cr** amounts. |

---

### JE-04 — Error and empty states

| Step | Action | Expected |
|------|--------|----------|
| 1 | With API stopped or invalid, reload the journals page. | Error is visible (e.g. in the table area), not a silent white screen. |
| 2 | Filters that match nothing. | **No journal entries for these filters.** |

---

### JE-05 — No permission

**Preconditions:** User without `accounting:read`.

| Step | Action | Expected |
|------|--------|----------|
| 1 | Open `/accounting/journals`. | **No permission.** |

---

## Financial reports

### FR-01 — Page loads and tabs work

**Preconditions:** User with `accounting:read`.

| Step | Action | Expected |
|------|--------|----------|
| 1 | Open `/accounting/reports`. | Heading **Financial reports**; subtitle mentions trial balance, P&amp;L, balance sheet, expense analysis; tab buttons **Trial balance**, **P&amp;L**, **Balance sheet**, **Expense analysis**. |
| 2 | Click each tab in turn. | Active tab is highlighted (indigo); content area switches without full-page error. |

---

### FR-02 — Trial balance (period)

| Step | Action | Expected |
|------|--------|----------|
| 1 | Select **Trial balance** tab; set **From** / **To** dates. | Data loads (or empty table with clear state); columns align with **Code**, **Name**, **Type**, **Debit**, **Credit** (per export labels). |
| 2 | If export actions exist, trigger **Excel** and/or **PDF** for trial balance. | File download or print dialog initiates without exception. |

---

### FR-03 — Profit & loss (period)

| Step | Action | Expected |
|------|--------|----------|
| 1 | Select **P&amp;L**; use same period controls as trial balance. | Report loads for the range; debit/credit columns behave consistently with posted activity. |

---

### FR-04 — Balance sheet (as of date)

| Step | Action | Expected |
|------|--------|----------|
| 1 | Select **Balance sheet**; set **As of** (or equivalent) date. | Report loads for that date; totals look sane (no obvious client crash). |

---

### FR-05 — Expense analysis

| Step | Action | Expected |
|------|--------|----------|
| 1 | Select **Expense analysis**; set period. | Rows show expense-related movement; **Net expense** (or **Net** in PDF export) present where applicable. |

---

### FR-06 — Cross-page consistency (smoke)

**Preconditions:** A posted journal exists affecting known accounts.

| Step | Action | Expected |
|------|--------|----------|
| 1 | Note account codes/amounts from **Journal entries** for a posted entry. | — |
| 2 | Open **Trial balance** for the same period. | Those movements appear in TB totals (exact tie-out can be deeper QA; smoke = visible inclusion, no contradictory error). |

---

### FR-07 — No permission

**Preconditions:** User without `accounting:read`.

| Step | Action | Expected |
|------|--------|----------|
| 1 | Open `/accounting/reports`. | **No permission.** |

---

## Navigation smoke

### NAV-01 — Accounting default route

| Step | Action | Expected |
|------|--------|----------|
| 1 | Open `/accounting` | Redirect to `/accounting/coa` (chart of accounts). |

---

## Day-to-day transaction smoke (journal-focused)

Use these as operational smoke checks after seed and once core masters (customer, supplier, product, warehouse) are available.

### OPS-01 — Owner equity injection (opening capital)

**Preconditions:** User with `accounting:write`; accounts available for cash/bank and owner's equity.

| Step | Action | Expected |
|------|--------|----------|
| 1 | Open **New journal entry**. | Entry form opens. |
| 2 | Post capital introduction (example): **Dr Cash/Bank**, **Cr Owner's Capital** with same amount. | Entry saves/posts successfully; totals balanced. |
| 3 | Open journal register and locate entry by reference/description. | Entry appears with correct status and two balanced lines. |

---

### OPS-02 — Purchase inventory on credit

**Preconditions:** Supplier exists; inventory and AP accounts available.

| Step | Action | Expected |
|------|--------|----------|
| 1 | Create journal for supplier purchase (example): **Dr Inventory Holding**, **Cr Accounts Payable — Trade**. | Journal validates and can be posted. |
| 2 | Open journal detail and confirm account mapping. | Inventory and payable lines are correct with matching amounts. |
| 3 | Open trial balance for the same period. | Inventory and AP balances reflect movement. |

---

### OPS-03 — Cash sale with COGS recognition

**Preconditions:** Sales and COGS accounts exist; at least one stocked product from seed data.

| Step | Action | Expected |
|------|--------|----------|
| 1 | Record revenue entry (example): **Dr Cash/Bank**, **Cr Sales**. | Entry posts successfully. |
| 2 | Record matching cost entry (example): **Dr COGS**, **Cr Inventory Holding**. | Entry posts successfully; both entries balanced individually. |
| 3 | Open P&L and trial balance for period. | Sales and COGS appear; inventory reduced accordingly. |

---

### OPS-04 — Credit sale and customer receipt

**Preconditions:** Customer exists; AR account available.

| Step | Action | Expected |
|------|--------|----------|
| 1 | Post credit sale (example): **Dr Accounts Receivable — Trade**, **Cr Sales**. | Journal saves/posts without validation error. |
| 2 | Post customer payment receipt (example): **Dr Cash/Bank**, **Cr Accounts Receivable — Trade**. | Receipt journal posts and reduces AR. |
| 3 | Verify in trial balance or customer ledger view if available. | AR net movement aligns with sale minus receipt. |

---

### OPS-05 — Supplier payment settlement

**Preconditions:** Existing payable balance from purchase transaction.

| Step | Action | Expected |
|------|--------|----------|
| 1 | Post supplier payment (example): **Dr Accounts Payable — Trade**, **Cr Cash/Bank**. | Journal posts successfully. |
| 2 | Re-open AP movement in period. | AP decreases by payment amount; cash/bank decreases. |

---

### OPS-06 — Purchase return / sales return handling

**Preconditions:** Existing purchase and/or sales entries in same smoke window.

| Step | Action | Expected |
|------|--------|----------|
| 1 | Post purchase return (example): **Dr Accounts Payable — Trade**, **Cr Inventory Holding**. | Return entry posts; inventory and AP adjust downward. |
| 2 | Post sales return (example): **Dr Sales Returns & Allowances**, **Cr Cash/AR** based on original sale type. | Entry posts without crash and report tabs remain stable. |
| 3 | Check P&L / trial balance. | Return impact is visible in correct accounts. |

---

### OPS-07 — Operating expense and accrual settlement

**Preconditions:** Expense and payable/cash accounts available.

| Step | Action | Expected |
|------|--------|----------|
| 1 | Post monthly expense (example rent/salary): **Dr Expense**, **Cr Accrued Expenses** or **Cr Cash/Bank**. | Journal posts and appears in register. |
| 2 | If accrued, post later settlement: **Dr Accrued Expenses**, **Cr Cash/Bank**. | Liability clears/reduces correctly. |
| 3 | Open P&L and balance sheet tabs. | Expense appears on P&L; accrual behavior appears in liabilities. |

---

### OPS-08 — Inventory adjustment and wastage

**Preconditions:** Inventory account has seeded/product activity.

| Step | Action | Expected |
|------|--------|----------|
| 1 | Post inventory loss/expiry adjustment: **Dr Distribution/Wastage Expense** (or relevant expense), **Cr Inventory Holding**. | Journal posts and inventory decreases. |
| 2 | Refresh reports for period. | Expense impact appears; no contradictory sign behavior or runtime errors. |

---

### OPS-09 — Day-end cross-check (register vs reports)

| Step | Action | Expected |
|------|--------|----------|
| 1 | Note all journals posted in this smoke run (equity, purchase, sale, payments, expenses, adjustments). | A complete reference list is available. |
| 2 | Open trial balance and P&L for same date range. | Material account movements from posted journals are visible in reports. |
| 3 | Reload journals and reports pages. | Data remains stable across reload; no client crash or silent failures. |
