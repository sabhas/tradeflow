# Smoke scenarios — Chart of accounts

Applies to: **Accounting → Chart of accounts** (`/accounting/coa`). Sidebar: **Accounting** (routes to COA by default).

---

### COA-01 — Page loads and sub-navigation is visible

**Preconditions:** User with `accounting:read`; API available.

| Step | Action | Expected |
|------|--------|----------|
| 1 | Log in and open `/accounting/coa` (or click **Accounting** in the sidebar). | Page heading **Chart of accounts** is shown. |
| 2 | Look below the heading. | Tabs/links **Chart of accounts**, **Journal entries**, **Financial reports** are visible (accounting sub-nav). |

---

### COA-02 — Account tree and posting list

**Preconditions:** COA-01 passes; ledger has at least one account (typical after seed/migrate).

| Step | Action | Expected |
|------|--------|----------|
| 1 | Wait for data to load (no indefinite **Loading…** without error). | Tree shows type groupings (e.g. Assets, Liabilities, …) or accounts; or empty state **No accounts yet.** if truly empty. |
| 2 | Click an account or folder in the left tree. | Right panel **Posting accounts** updates; table shows **Code** / **Name** columns when there are leaves, or the empty hint to select a group. |
| 3 | Click **Expand all**, then **Collapse all**. | Tree expands and collapses without a blank screen or crash. |

---

### COA-03 — Search filters the tree

**Preconditions:** COA-02 passes with multiple accounts.

| Step | Action | Expected |
|------|--------|----------|
| 1 | In the search field (placeholder **Search by code or name…**), type part of a known account code. | Tree filters to matching accounts; non-matching nodes hidden or empty message **No accounts match your search.** |
| 2 | Clear the search. | Full tree (or unfiltered view) returns. |

---

### COA-04 — Refresh reloads data

| Step | Action | Expected |
|------|--------|----------|
| 1 | Click **Refresh**. | No crash; list/tree reflects current server data (e.g. after external DB change, may require repeat). |

---

### COA-05 — Add account (write permission)

**Preconditions:** User with `accounting:write`; valid unused code for the test.

| Step | Action | Expected |
|------|--------|----------|
| 1 | Confirm **Add account** button is visible. | — |
| 2 | Click **Add account**. | Modal **New account** opens with fields **Code**, **Name**, **Type**, **Parent account (optional)**. |
| 3 | Enter a unique **Code** and **Name**, pick a **Type**, optional parent, click **Create**. | Modal closes; new account appears in tree; no unexplained error banner. |
| 4 | (Optional) Select a folder in the tree, click **Add account** again. | New account defaults align with selected type/parent where applicable. |

---

### COA-06 — Cash and bank defaults

**Preconditions:** `accounting:read`; for saving, `accounting:write`.

| Step | Action | Expected |
|------|--------|----------|
| 1 | Expand **Cash and bank defaults**. | Section explains use for receipts/supplier payments; **Default cash** and **Default bank** selects list asset accounts. |
| 2 | If permitted, change selections and click **Save**. | Saves without error; values persist after **Refresh** or revisiting the page. |

---

### COA-07 — No permission

**Preconditions:** User **without** `accounting:read`.

| Step | Action | Expected |
|------|--------|----------|
| 1 | Navigate to `/accounting/coa`. | Message **No permission.** (or equivalent access denied), not a blank page. |
