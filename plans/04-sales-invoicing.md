# Feature Plan: Sales & Invoicing

**Phase:** 1 (MVP)  
**Depends on:** [01-core-architecture.md](01-core-architecture.md), [02-master-data-management.md](02-master-data-management.md), [03-inventory-management.md](03-inventory-management.md)  
**Tech:** Express, TypeORM, PostgreSQL, React, Redux, TanStack Query, Tailwind

---

## 1. Objective

Support the sales flow from quotation to sales order to invoice and delivery note; cash and credit sales; invoicing with tax and discounts; customer credit limits and payment terms; receipts and customer statements with aging.

---

## 2. Scope

### 2.1 Sales flow

- **Entities:** Quotation → Sales Order → Invoice; optional Delivery Note linked to SO/Invoice.
- **State:** Draft → Confirmed/Sent; partial delivery via line-level delivered quantity.
- **Cash vs credit:** Invoice type or payment type: cash (immediate) or credit (outstanding balance; receipts reduce it).

### 2.2 Invoicing

- **Header:** customerId, date, dueDate, subtotal, taxAmount, discountAmount, total, status, paymentType (cash/credit), warehouseId (for stock deduction).
- **Lines:** productId, quantity, unitPrice, taxAmount, discountAmount, taxProfileId (optional override).
- **Rules:** Tax from customer/product tax profile (inclusive or exclusive); item and invoice-level discount; rounding from settings.
- **Templates:** Invoice PDF with company profile and line items (see Settings for template customization).

### 2.3 Customer management (sales side)

- **Credit limit:** On create/confirm invoice: check customer outstanding balance + this invoice total ≤ credit limit; block or warn.
- **Payment terms:** Set due date from terms (e.g. Net 30).
- **Outstanding:** Sum of unpaid invoice totals minus receipts; customer statement = list of invoices and payments; aging = 30/60/90+ buckets.

---

## 3. Data model (TypeORM)

- **Quotation** – id, customerId, quotationDate, validUntil, status, subtotal, tax, discount, total, notes, branchId, createdBy, createdAt, updatedAt.
- **QuotationLine** – id, quotationId, productId, quantity, unitPrice, taxAmount, discountAmount.
- **SalesOrder** – id, customerId, orderDate, status, warehouseId?, subtotal, tax, discount, total, notes, branchId, createdBy, createdAt, updatedAt.
- **SalesOrderLine** – id, salesOrderId, productId, quantity, unitPrice, taxAmount, discountAmount, deliveredQuantity (default 0).
- **Invoice** – id, customerId, invoiceDate, dueDate, status, paymentType (cash/credit), warehouseId, subtotal, taxAmount, discountAmount, total, notes, branchId, salesOrderId? (optional), createdBy, createdAt, updatedAt.
- **InvoiceLine** – id, invoiceId, productId, quantity, unitPrice, taxAmount, discountAmount, taxProfileId?.
- **DeliveryNote** (optional) – id, invoiceId or salesOrderId, deliveryDate, status, branchId; **DeliveryNoteLine** – deliveryNoteId, productId, quantity.
- **Receipt** – id, customerId, receiptDate, amount, paymentMethod, reference, branchId, createdBy, createdAt.
- **ReceiptAllocation** – id, receiptId, invoiceId, amount (allocates receipt to invoice(s); supports partial payments).

Indexes: Invoice(customerId, status), Invoice(invoiceDate), Receipt(customerId), ReceiptAllocation(receiptId, invoiceId).

---

## 4. Business rules

- **Invoice posting (confirm):** In one transaction: (1) Create inventory movements (sale, negative qty) per line for warehouseId; (2) Create accounting entries (dr Receivable, cr Sales, cr Tax payable, etc. – see Accounting plan); (3) Update invoice status to Posted. Validate: stock available, credit limit if credit sale.
- **Receipt posting:** Create Receipt and ReceiptAllocation(s); in accounting: dr Cash/Bank, cr Receivable; reduce customer balance. Allocation: user selects invoice(s) and amounts, or auto-allocate oldest first.
- **Tax calculation:** Use shared tax helper: given line amount and tax profile (inclusive/exclusive), compute base + tax; sum for invoice.
- **Due date:** If not set, compute from customer payment terms (e.g. invoiceDate + netDays).

---

## 5. API (Express)

- **Quotations:** GET list, GET :id, POST, PATCH, DELETE (draft); POST quotations/:id/convert-to-order (create SO from quotation).
- **Sales orders:** GET list, GET :id, POST, PATCH, DELETE; PATCH :id/confirm; POST :id/convert-to-invoice (create invoice from SO, optionally partial).
- **Invoices:** GET list (filter by customer, date, status), GET :id, POST (draft), PATCH (draft only), POST :id/post (post invoice: stock + accounting), GET :id/pdf.
- **Receipts:** POST (body: customerId, date, amount, paymentMethod, reference, allocations: [{ invoiceId, amount }]); GET list by customer or date.
- **Customer statement:** GET /customers/:id/statement?dateFrom=&dateTo= – list of invoices and receipts with running balance.
- **Aging:** GET /customers/aging or /reports/aging – receivables by 30/60/90+ buckets.

---

## 6. Frontend (React)

- **Quotation list and form:** Lines with product, qty, price, tax, discount; “Convert to order” button.
- **Sales order list and form:** Same; “Convert to invoice” with option to select lines/quantities for partial invoice.
- **Invoice list and form:** Draft edit; “Post” button (with credit limit and stock check); print/PDF button.
- **Barcode:** On invoice line entry, allow scan or type barcode → lookup product and add line (from masters).
- **Receipt form:** Select customer; amount; allocation to invoices (dropdown or table: select invoices and amounts); post.
- **Customer statement:** Page or modal: select customer, date range; show table of invoices and payments and balance. Aging report: table by customer and bucket.

Use TanStack Query for lists and details; invalidate after post invoice or receipt. Redux: current warehouse, default payment method if needed.

---

## 7. Permissions

- sales:quotations:read/write, sales:orders:read/write, sales:invoices:read/write, sales:invoices:post, sales:receipts:read/write. Optionally sales:invoices:post restricted to Accountant.

---

## 8. Implementation tasks

1. Add TypeORM entities for Quotation, QuotationLine, SalesOrder, SalesOrderLine, Invoice, InvoiceLine, Receipt, ReceiptAllocation; migrations.
2. Implement quotation and sales order CRUD and convert-to-order / convert-to-invoice.
3. Implement invoice CRUD and post service (call inventory movement creation and accounting posting); integrate tax helper from shared or Tax module.
4. Implement receipt and allocation; statement and aging APIs.
5. Frontend: quotation and sales order screens; invoice list and form; post and PDF; receipt form with allocation.
6. Frontend: customer statement and aging report (or under Reporting module with shared API).
7. Credit limit check on post (and optionally on save); stock availability check on post.
8. Invoice PDF generation (template with company profile and lines); optional barcode scanning for line entry.

---

## 9. Acceptance criteria

- [ ] Create quotation → convert to SO → convert to invoice (full or partial); post invoice creates stock movements and accounting entries.
- [ ] Credit limit is enforced (or warned) when posting credit invoice; due date derived from payment terms.
- [ ] Receipt can be allocated to one or more invoices; customer balance decreases; accounting entries correct.
- [ ] Statement shows all invoices and payments in range with running balance; aging report shows 30/60/90+ buckets.
- [ ] Invoice PDF prints with company details and line items.

---

## 10. References

- Main plan: Part B § 4 (Sales & Invoicing). Accounting: [06-accounting-finance.md](06-accounting-finance.md). Tax: [07-tax-management.md](07-tax-management.md).
