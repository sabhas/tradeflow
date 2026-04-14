# Smoke scenarios — New pharma distribution business setup

Covers first-day setup checks for a fresh pharma distribution environment after seeding baseline data.

---

## Preconditions

- Database migrations are applied.
- Seed is executed from repo root before smoke checks:
  - `pnpm db:seed`
- API and desktop app are running.
- Login with seeded admin user:
  - Email: `admin@tradeflow.local`
  - Password: `admin123`

---

### NBS-01 — Seed baseline data is present

| Step | Action | Expected |
|------|--------|----------|
| 1 | Open **Settings** page. | Company profile shows seeded business identity for Tradeflow Pharma Distributors (name, city, currency) without blank critical fields. |
| 2 | Open **Masters** areas relevant for setup (products, suppliers, customers, warehouses). | Seeded baseline masters are present (major suppliers, starter customers, and at least one default warehouse). |

---

### NBS-02 — Company profile can be reviewed and saved

| Step | Action | Expected |
|------|--------|----------|
| 1 | In **Settings**, edit a non-critical field (example: phone or address line). | Form accepts input and keeps validation state clean. |
| 2 | Save settings. | Success feedback appears and no crash/blank page occurs. |
| 3 | Refresh page and reopen settings. | Updated value persists. |

---

### NBS-03 — Chart of accounts and defaults are ready

| Step | Action | Expected |
|------|--------|----------|
| 1 | Open `/accounting/coa`. | Chart of accounts tree loads with seeded pharma distribution accounts. |
| 2 | Expand **Cash and bank defaults**. | Default cash and default bank selections are pre-populated from seeded accounts (`1000` / `1010` equivalents). |
| 3 | Click **Refresh**. | Accounts/defaults remain stable after reload. |

---

### NBS-04 — Core operating masters are usable

| Step | Action | Expected |
|------|--------|----------|
| 1 | Open supplier master and search for seeded suppliers (for example Pfizer or GSK). | Matching supplier records are visible and selectable. |
| 2 | Open product master and search for seeded SKUs (example `PHR-PAR-500-20S`). | Seeded product appears with expected category and pricing fields. |
| 3 | Open customer master and verify a seeded customer (example hospital/retailer entry). | Customer record opens without errors and has payment/tax fields populated. |

---

### NBS-05 — Inventory and accounting screens load with seeded setup

| Step | Action | Expected |
|------|--------|----------|
| 1 | Open inventory-related pages (stock, products, or relevant dashboard route). | No permission or runtime error for admin user; seeded items are available where applicable. |
| 2 | Open `/accounting/journals` and `/accounting/reports`. | Pages load successfully with filters/tabs; empty states are handled cleanly if no transactions are posted yet. |

---

### NBS-06 — Role-based seeded users can authenticate

| Step | Action | Expected |
|------|--------|----------|
| 1 | Log out and sign in with `accountant@tradeflow.local` / `accountant123`. | Login succeeds and accounting pages are accessible. |
| 2 | Log out and sign in with `sales@tradeflow.local` / `sales123`. | Login succeeds and sales-focused screens load without permission mismatch for seeded role. |
| 3 | Log out and sign in with `storekeeper@tradeflow.local` / `store123`. | Login succeeds and inventory-related screens are accessible for the role. |

---

### NBS-07 — Reseed is idempotent (quick sanity)

| Step | Action | Expected |
|------|--------|----------|
| 1 | Re-run `pnpm db:seed`. | Seed completes successfully without fatal errors. |
| 2 | Re-open suppliers/products/accounts. | No obvious duplicate corruption in key masters (records remain usable and app stays stable). |
