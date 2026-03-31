# Feature Plan: Logistics & Distribution

**Phase:** 3 (Optional)  
**Depends on:** [01-core-architecture.md](01-core-architecture.md), [02-master-data-management.md](02-master-data-management.md), [04-sales-invoicing.md](04-sales-invoicing.md)  
**Tech:** Express, TypeORM, PostgreSQL, React, Redux, TanStack Query, Tailwind

---

## 1. Objective

Support delivery management: routes, delivery runs, delivery notes linked to orders/invoices, and proof of delivery (POD). Salesperson tracking: performance and route-wise sales; optional commission calculation.

For pharmaceutical distribution, include safeguards for temperature-sensitive and controlled products, while keeping route and POD flows reusable for generic distribution.

---

## 2. Scope

### 2.1 Delivery management

- **Routes** – Master: name, code, area; optional sequence of stops (customer or location).
- **Delivery runs** – Date, vehicle, driver (or salesperson), route; list of delivery notes (orders/invoices) assigned.
- **Delivery notes** – Link to invoice or sales order; status (pending, dispatched, delivered); optional printed DN for customer.
- **Proof of delivery (POD)** – Signature or photo reference; link to delivery note; timestamp.
- **Cold-chain and controlled handling (optional)** – Mark runs/delivery notes requiring temperature compliance or controlled-substance controls; capture checks at dispatch/delivery.

### 2.2 Salesperson tracking

- **Link** – Invoices and orders already have optional salespersonId (from masters). Use for reports.
- **Reports** – Sales by salesperson (value/quantity); sales by route; period comparison.
- **Commission** – Configurable rule (e.g. % of margin or value); compute from invoice lines; store or compute on demand (Phase 3).

---

## 3. Data model (TypeORM)

- **Route** – id, name, code, description, branchId, createdAt, updatedAt.
- **RouteStop** (optional) – id, routeId, sequenceOrder, customerId or address; for route planning.
- **DeliveryRun** – id, runDate, routeId, vehicleInfo?, driverId? (userId or salespersonId), status, branchId, createdBy, createdAt.
- **DeliveryRunItem** – id, deliveryRunId, deliveryNoteId (or invoiceId/salesOrderId); links run to deliveries.
- **DeliveryNote** – id, invoiceId? (or salesOrderId?), deliveryDate, status (pending/dispatched/delivered), warehouseId?, branchId, createdBy, createdAt.
- **DeliveryNoteLine** – id, deliveryNoteId, productId, quantity (copy from invoice/order or allow partial).
- **ProofOfDelivery** – id, deliveryNoteId, type (signature/photo), reference (file path or URL), notes, createdAt.
- **Salesperson** – (existing in masters) id, name, code, branchId. Link Invoice.salespersonId, SalesOrder.salespersonId.

---

## 4. Business rules

- **Delivery note:** Can be created from invoice (or SO); one DN per invoice or multiple for partial delivery. Status flow: pending → dispatched → delivered.
- **POD:** When marking “delivered”, user can attach signature/image; store in ProofOfDelivery and update DeliveryNote status.
- **Delivery run:** Assign delivery notes to a run; optional print run sheet (list of deliveries and addresses).

---

## 5. API (Express)

- **Routes:** GET, POST, PATCH, DELETE; GET /routes/:id/stops (if RouteStop used).
- **Delivery runs:** GET list (filter by date, route), GET :id, POST (create with optional assignment of DNs), PATCH :id (update status, assign DNs).
- **Delivery notes:** GET list (filter by status, date, run), GET :id, POST (from invoice or SO; optional lines), PATCH :id (status), POST :id/pod (attach POD).
- **Reports:** GET /reports/sales-by-salesperson?dateFrom=&dateTo=, GET /reports/sales-by-route?dateFrom=&dateTo=; GET /reports/commission?dateFrom=&dateTo= (Phase 3, if commission implemented).

---

## 6. Frontend (React)

- **Routes:** List and form; optional stop sequence (drag-drop or list).
- **Delivery run:** Create run (date, route, driver); assign delivery notes to run; run sheet view/print.
- **Delivery notes:** List with status filter; create from invoice; update status (dispatched/delivered); POD upload (signature/image) when delivering.
- **Reports:** Sales by salesperson (table/chart); sales by route; commission report if implemented.

---

## 7. Implementation tasks

1. Add Route, RouteStop, DeliveryRun, DeliveryRunItem, DeliveryNote, DeliveryNoteLine, ProofOfDelivery entities; migrations; add salespersonId to Invoice and SalesOrder if not already.
2. Implement route and delivery run CRUD; delivery note create from invoice/SO and status update; POD upload (store file path or base64 in DB or file store).
3. Implement sales-by-salesperson and sales-by-route reports (aggregate from Invoice/InvoiceLine with salespersonId).
4. Frontend: route and delivery run screens; delivery note list and form; POD capture (camera or file upload) and link to DN.
5. Optional: commission calculation (config rule in settings; compute from invoice lines by salesperson); commission report and export.
6. Permissions: logistics:routes:read/write, logistics:deliveries:read/write, logistics:pod:write; reports: salesperson, route.

---

## 8. Acceptance criteria

- [ ] Routes can be created and assigned to delivery runs; delivery notes can be assigned to a run.
- [ ] Delivery note created from invoice; status can be set to dispatched and delivered; POD can be attached when delivered.
- [ ] Where enabled, cold-chain/controlled-delivery checks are captured without impacting standard distribution workflows.
- [ ] Sales by salesperson and by route reports show correct totals for the period.
- [ ] (Optional) Commission report reflects configured rule and invoice data.

---

## 9. References

- Main plan: Part B § 8 (Logistics & Distribution). Masters: [02-master-data-management.md](02-master-data-management.md). Sales: [04-sales-invoicing.md](04-sales-invoicing.md).
