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
