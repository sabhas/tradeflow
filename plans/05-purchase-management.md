# Feature Plan: Purchase Management

**Phase:** 2  
**Depends on:** [01-core-architecture.md](01-core-architecture.md), [02-master-data-management.md](02-master-data-management.md), [03-inventory-management.md](03-inventory-management.md), [06-accounting-finance.md](06-accounting-finance.md)  
**Tech:** Express, TypeORM, PostgreSQL, React, Redux, TanStack Query, Tailwind

---

## 1. Objective

Support purchase flow: Purchase Request → Purchase Order → Goods Received Note (GRN) → Supplier Invoice; purchase returns and debit notes; supplier payables, payments, statements, and aging.

---

## 2. Scope

### 2.1 Purchase flow

- **Purchase request (PR)** – Optional; internal request for materials.
- **Purchase order (PO)** – Sent to supplier; lines with product, qty, expected price.
- **GRN** – Goods received; can be against PO; creates inventory movement (purchase) and optionally accrual or direct to payable when matched with supplier invoice.
- **Supplier invoice** – Match to PO/GRN; posts accounting (dr Inventory/Expense, cr Payable) and optionally updates inventory cost.
- **Purchase returns / debit notes** – Negative flow; reduce stock and payable.

### 2.2 Supplier controls

- **Pricing history** – From PO and supplier invoice lines; report “supplier pricing history”.
- **Payables** – Outstanding from supplier invoices minus payments; supplier statement and aging (30/60/90+).

---

## 3. Data model (TypeORM)

- **PurchaseRequest** (optional) – id, requestDate, status, requestedBy, branchId; **PurchaseRequestLine** – requestId, productId, quantity, notes.
- **PurchaseOrder** – id, supplierId, orderDate, expectedDate, status, warehouseId, subtotal, taxAmount, discountAmount, total, notes, branchId, createdBy, createdAt, updatedAt.
- **PurchaseOrderLine** – id, purchaseOrderId, productId, quantity, unitPrice, taxAmount, discountAmount, receivedQuantity (default 0).
- **Grn** – id, purchaseOrderId?, supplierId, grnDate, warehouseId, status, branchId, createdBy, createdAt.
- **GrnLine** – id, grnId, productId, quantity, unitPrice (from PO or entered); link to purchaseOrderLineId if from PO.
- **SupplierInvoice** – id, supplierId, invoiceNumber (supplier’s ref), invoiceDate, dueDate, purchaseOrderId?, grnId? (optional link), status, subtotal, taxAmount, discountAmount, total, branchId, createdAt, updatedAt.
- **SupplierInvoiceLine** – id, supplierInvoiceId, productId, quantity, unitPrice, taxAmount, discountAmount, grnLineId? (optional match).
- **PurchaseReturn** (optional) – id, supplierId, returnDate, status, branchId; **PurchaseReturnLine** – returnId, productId, quantity, unitPrice.
- **SupplierPayment** – id, supplierId, paymentDate, amount, paymentMethod, reference, branchId, createdBy, createdAt.
- **SupplierPaymentAllocation** – id, supplierPaymentId, supplierInvoiceId, amount.

Indexes: PurchaseOrder(supplierId), Grn(purchaseOrderId), SupplierInvoice(supplierId), SupplierPayment(supplierId).

---

## 4. Business rules

- **GRN posting:** Create Grn + GrnLine; create inventory movements (refType=purchase) for warehouseId; update PO line receivedQuantity. Optionally create accounting accrual (dr Inventory, cr Accrued Payable) or wait for supplier invoice.
- **Supplier invoice posting:** Create SupplierInvoice + lines; accounting: dr Inventory (or Expense), dr Tax, cr Payable; if linked to GRN, update cost on inventory movement or stock balance. Reduce payable when payment is allocated.
- **Supplier payment:** Create SupplierPayment + SupplierPaymentAllocation(s); accounting: dr Payable, cr Cash/Bank.
- **Pricing history:** Query PO and SupplierInvoice lines grouped by supplierId, productId; report or API.

---

## 5. API (Express)

- **Purchase orders:** GET list, GET :id, POST, PATCH (draft), POST :id/send (status update); GET :id/grn-eligible (lines not fully received).
- **GRN:** GET list, GET :id, POST (body: purchaseOrderId?, supplierId, warehouseId, date, lines); POST :id/post (create movements and update PO received qty).
- **Supplier invoices:** GET list, GET :id, POST, PATCH (draft), POST :id/post (accounting + optional cost update).
- **Supplier payments:** POST (body: supplierId, date, amount, method, reference, allocations); GET list.
- **Supplier statement:** GET /suppliers/:id/statement?dateFrom=&dateTo=.
- **Aging payables:** GET /reports/payables-aging.
- **Supplier pricing history:** GET /suppliers/:id/pricing-history or /reports/supplier-pricing.

---

## 6. Frontend (React)

- **PO list and form:** Select supplier, warehouse; lines (product, qty, price); save and send.
- **GRN:** Create from PO (prefill lines) or manual; enter received qty; post GRN (stock in).
- **Supplier invoice:** Create; link to PO/GRN if needed; enter lines and amounts; post (accounting).
- **Supplier payment:** Form with allocation to one or more supplier invoices; post.
- **Supplier statement and payables aging:** Report screens (can reuse Reporting module layout).

---

## 7. Permissions

- purchases:orders:read/write, purchases:grn:read/write, purchases:supplier-invoices:read/write, purchases:payments:read/write.

---

## 8. Implementation tasks

1. Add all purchase entities; migrations; relations to Product, Warehouse, Supplier, and Accounting (ledger).
2. Implement PO CRUD and GRN create/post (inventory movement creation).
3. Implement supplier invoice CRUD and post (accounting entries to Payable, Inventory/Expense, Tax).
4. Implement supplier payment and allocation; statement and aging APIs.
5. Frontend: PO, GRN, supplier invoice, and payment screens; statement and aging reports.
6. Optional: purchase return and debit note; supplier pricing history report.
7. Audit and RBAC for all purchase endpoints.

---

## 9. Acceptance criteria

- [ ] Create PO and receive goods via GRN; stock increases; PO received quantities updated.
- [ ] Post supplier invoice creates payable and expense/inventory entries; payment allocation reduces payable.
- [ ] Supplier statement and payables aging are correct; pricing history report available.

---

## 10. References

- Main plan: Part B § 5 (Purchase Management). Inventory: [03-inventory-management.md](03-inventory-management.md). Accounting: [06-accounting-finance.md](06-accounting-finance.md).
