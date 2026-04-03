# Import / export

## API

- **Templates:** `GET /import/products/template`, `/import/customers/template`, `/import/opening-balances/template` — query `format=xlsx` (default) or `format=csv`.
- **Upload:** `POST /import/products`, `/import/customers`, `/import/opening-balances` — multipart field `file` (max 5 MB). JSON response: `{ successCount, errors: [{ row, field?, message }] }`.
- **List export:** `GET /export/products`, `/export/customers`, `/export/invoices` — Excel download; branch scope matches other list APIs (`branchId` from auth). Products accept `categoryId` and `search`; invoices accept `customerId`, `status`, `dateFrom`, `dateTo`.

## Column reference

### Products (import)

| Column | Required | Notes |
|--------|----------|--------|
| category | yes | Category **code** or **name** (branch-scoped) |
| sku | yes | Unique per branch (active rows) |
| name | yes | |
| unit | yes | Unit **code** |
| barcode | no | |
| costPrice, sellingPrice | no | Default 0 |
| batchTracked, expiryTracked | no | true/false, yes/no, 1/0 |

Header aliases are accepted (e.g. `categoryCode`, `unitCode`, `cost`, `price`).

### Customers (import)

| Column | Required | Notes |
|--------|----------|--------|
| name | yes | |
| type | yes | `retailer`, `wholesaler`, `walk_in` |
| contactPhone, contactEmail, contactAddress | no | |
| creditLimit | no | Default 0 |
| paymentTerms | no | Must match an existing payment term **name** if set |
| taxProfile | no | Must match an existing tax profile **name** if set |

### Opening balances

**Inventory sheet (or CSV with these columns):** `warehouseCode`, `movementDate` (YYYY-MM-DD), `productSku`, `quantity`, optional `unitCost`. Rows are grouped by warehouse + date; each group posts one opening-balance batch (same behavior as the inventory UI).

**Journal sheet (Excel only, optional):** `entryDate`, optional `reference`, `accountCode`, `debit`, `credit`. Consecutive logical groups: same `entryDate` + `reference` form one **posted** journal entry; each group must balance. Requires `accounting:write` in addition to `inventory:write` when this sheet is present.

## Integrations (extension points)

- **Barcode / POS:** `GET /products/lookup/barcode/:barcode` — returns product JSON for the user’s branch scope (requires `masters.products:read`).
- **Accounting export:** Use **Journal** import format or `GET /journal-entries` plus chart export patterns; for external systems, CSV of `entryDate`, `reference`, `accountCode`, `debit`, `credit` matches the opening-balance journal template.
- **E-commerce / webhooks:** Not implemented; add authenticated routes or workers that call existing sales/inventory services and respect `branchId`.

Admin backup/restore (`pg_dump` / restore) is described separately in security/ops docs when enabled.
