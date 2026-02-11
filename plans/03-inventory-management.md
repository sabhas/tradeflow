# Feature Plan: Inventory Management

**Phase:** 1 (MVP) – single warehouse; Phase 2 – multi-warehouse, transfers, alerts  
**Depends on:** [01-core-architecture.md](01-core-architecture.md), [02-master-data-management.md](02-master-data-management.md)  
**Tech:** Express, TypeORM, PostgreSQL, React, Redux, TanStack Query, Tailwind

---

## 1. Objective

Manage stock levels in real time: movements (opening, purchase, sale, adjustment, transfer), current balances per product and warehouse, and basic inventory reports. Phase 2 adds multi-warehouse transfers, reorder alerts, and costing (FIFO/LIFO).

---

## 2. Scope

### 2.1 Stock control (Phase 1)

- **Real-time stock levels** – One or more warehouses; each product has a balance per warehouse.
- **Movement types:** opening_balance, purchase, sale, adjustment, transfer_out, transfer_in (Phase 2).
- **Opening balances** – Post opening balance movements for a given date; used for go-live or trial balance.
- **Adjustments** – Increase or decrease stock with reason (damage, loss, expiry, count correction); optional approval in Phase 2.
- **Transfers** (Phase 2) – Move stock between warehouses; one transaction creates transfer_out at source and transfer_in at destination.

### 2.2 Advanced (Phase 2)

- **Minimum stock and reorder level** – Stored on Product; report or dashboard widget for items below min/reorder.
- **FIFO/LIFO costing** – Store unit cost on movements; on sale/issue compute COGS from FIFO or LIFO; batch-wise valuation if batch tracked.
- **Reports** – Dead stock (no movement in X days), slow-moving; current stock valuation.

---

## 3. Data model (TypeORM)

- **Warehouse** – (from masters) id, name, code, branchId, isDefault.
- **InventoryMovement** – id, productId, warehouseId, quantityDelta (+ or -), refType (enum: opening_balance, purchase, sale, adjustment, transfer_in, transfer_out), refId (e.g. invoice id, adjustment id), unitCost?, movementDate, branchId?, createdAt, userId?.
- **StockBalance** – id, productId, warehouseId, quantity, updatedAt (or use a view/materialized view from sum of movements). Prefer real table updated in same transaction as movement for performance.
- **StockTransfer** (Phase 2) – id, fromWarehouseId, toWarehouseId, status, transferDate, branchId; **StockTransferLine** – transferId, productId, quantity.
- **StockAdjustment** (optional) – id, warehouseId, reason, status, approvedBy?, branchId?; **StockAdjustmentLine** – adjustmentId, productId, quantityDelta. Alternatively, adjustments can be posted as movements with refType=adjustment and refId pointing to a simple header table.

Indexes: InventoryMovement(productId, warehouseId, movementDate), StockBalance(productId, warehouseId) unique.

---

## 4. Business rules

- **Post movement:** In one transaction: insert InventoryMovement; upsert StockBalance (increment/decrement quantity). Validate quantityDelta sign matches refType (e.g. sale = negative).
- **Opening balance:** refType = opening_balance; typically one per product per warehouse per “as of” date (or allow multiple and sum).
- **Adjustment:** refType = adjustment; refId can link to approval record in Phase 2.
- **Transfer (Phase 2):** Create StockTransfer + lines; then create movements: transfer_out at source, transfer_in at destination; update both StockBalance rows in one transaction.
- **Negative stock:** Decide policy: block (reject) or allow (with alert). Recommend block for Phase 1.

---

## 5. API (Express)

- `GET /inventory/balances` – query params: warehouseId?, productId?, branchId from auth. Returns list of productId, warehouseId, quantity (and optional value if cost available).
- `GET /inventory/movements` – list with filters: productId, warehouseId, refType, dateFrom, dateTo; paginated.
- `POST /inventory/opening-balance` – body: warehouseId, date, lines: [{ productId, quantity, unitCost? }]. Creates movements and updates balances.
- `POST /inventory/adjustment` – body: warehouseId, reason, lines: [{ productId, quantityDelta }]. Creates movements and updates balances; optionally create approval record (Phase 2).
- `GET /inventory/balances/low-stock` – products where quantity &lt; minStock or quantity &lt; reorderLevel (Phase 2).
- **Phase 2:** `POST /inventory/transfers` – create transfer and movements; `GET /inventory/transfers`, `PATCH /inventory/transfers/:id` (e.g. confirm).

---

## 6. Frontend (React)

- **Current stock:** Table by warehouse (and product filter); show product name, SKU, quantity, optional unit cost and value. Export to Excel (use report export from Reporting plan).
- **Movements:** List with filters (date range, product, warehouse, type); drill-down to document (invoice, adjustment) where applicable.
- **Opening balance:** Form: select warehouse, date, add lines (product, qty, cost); submit to post opening balance.
- **Adjustment:** Form: warehouse, reason dropdown or text, lines (product, quantity delta); submit to post adjustment.
- **Phase 2:** Transfer form (from/to warehouse, lines); transfer list and status. Low-stock widget or report.

Use TanStack Query for balances and movements; invalidate after post opening balance, adjustment, or transfer. Redux: current warehouse selector if needed across screens.

---

## 7. Integration with other modules

- **Sales:** When invoice is posted, create inventory movement refType=sale, refId=invoiceId (see Sales & Invoicing plan).
- **Purchase:** When GRN or purchase receipt is posted, create movement refType=purchase (see Purchase plan).
- **Accounting:** Inventory value can be derived from balances × cost (FIFO/LIFO from movements) for balance sheet and P&L (see Accounting plan).

---

## 8. Implementation tasks

1. Add TypeORM entities InventoryMovement, StockBalance; migration; ensure StockBalance updated in same transaction as movement (repository or query runner).
2. Implement balance and movement read APIs; implement opening balance and adjustment post APIs with validation (no negative balance if policy is block).
3. Frontend: current stock list and movements list with filters; opening balance and adjustment forms.
4. (Phase 2) Add StockTransfer, StockTransferLine; transfer API and movement creation; transfer UI.
5. (Phase 2) Low-stock API and UI; optional FIFO/LIFO service and use in sale/purchase posting.
6. Add audit logging for adjustments and transfers; permissions: inventory:read, inventory:write, inventory:approve (Phase 2).

---

## 9. Acceptance criteria

- [ ] Posting opening balance creates movements and updates balances; balances are correct after multiple operations.
- [ ] Posting adjustment increases or decreases stock; movements list shows all types with correct ref.
- [ ] Sales and purchase posting (when implemented) create corresponding inventory movements and update balances.
- [ ] Negative stock is prevented (or allowed with clear policy and alert).
- [ ] (Phase 2) Transfers between warehouses work; both warehouses’ balances update correctly. Low-stock report/list available.

---

## 10. References

- Main plan: Part B § 3 (Inventory Management Module).
