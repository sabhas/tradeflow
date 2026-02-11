# Feature Plan: Master Data Management

**Phase:** 1 (MVP)  
**Depends on:** [01-core-architecture.md](01-core-architecture.md)  
**Tech:** Express, TypeORM, PostgreSQL, React, Redux, TanStack Query, Tailwind

---

## 1. Objective

Provide all master data that other modules depend on: product categories and products (with SKU, barcode, UoM, batch/expiry, pricing), customers, suppliers, warehouses, salespersons, and tax profiles.

---

## 2. Scope

### 2.1 Product and inventory masters

- **Product categories** – Tree (parent_id); name, code.
- **Products** – categoryId, sku, barcode, name, unitId, costPrice, sellingPrice, batchTracked, expiryTracked, minStock?, reorderLevel?; optional branchId.
- **Units of measure** – code, name (e.g. pcs, cartons, kg).
- **Price levels** – e.g. Retail, Wholesale.
- **Product prices** – productId, priceLevelId, price (for multiple price levels per product).

### 2.2 Business masters

- **Customers** – name, type (retailer/wholesaler/walk-in), contact, creditLimit, paymentTermsId, taxProfileId, branchId?.
- **Suppliers** – name, contact, paymentTermsId?, taxProfileId?, branchId?.
- **Warehouses** – name, code, branchId? (at least one default warehouse for Phase 1).
- **Salespersons** – name, code, branchId?.
- **Tax profiles** – name, rate (%), isInclusive, region? (for future region-based tax).

---

## 3. Data model (TypeORM entities)

- **ProductCategory** – id, parentId?, name, code, branchId?, createdAt, updatedAt, deletedAt?
- **Product** – id, categoryId, sku, barcode, name, unitId, costPrice, sellingPrice, batchTracked, expiryTracked, minStock, reorderLevel, branchId?, createdAt, updatedAt, deletedAt?
- **UnitOfMeasure** – id, code, name, branchId?
- **PriceLevel** – id, name, branchId?
- **ProductPrice** – id, productId, priceLevelId, price
- **Customer** – id, name, type, contact, creditLimit, paymentTermsId, taxProfileId, branchId?, createdAt, updatedAt, deletedAt?
- **Supplier** – id, name, contact, paymentTermsId, taxProfileId, branchId?, createdAt, updatedAt, deletedAt?
- **Warehouse** – id, name, code, branchId?, isDefault?
- **Salesperson** – id, name, code, branchId?
- **TaxProfile** – id, name, rate, isInclusive, region?, branchId?
- **PaymentTerms** – id, name, netDays (e.g. 30 for Net 30), branchId?

Indexes: Product(sku), Product(barcode), Product(categoryId), Customer(branchId), etc. Unique constraints: Product(sku, branchId), Product(barcode, branchId) where applicable.

---

## 4. API (Express)

- **Categories:** `GET /product-categories` (tree or flat), `POST /product-categories`, `PATCH /product-categories/:id`, `DELETE /product-categories/:id` (soft delete).
- **Products:** `GET /products` (list with filters: category, search by name/sku/barcode), `GET /products/:id`, `POST /products`, `PATCH /products/:id`, `DELETE /products/:id`.
- **UoM:** `GET /units`, `POST /units`, `PATCH /units/:id`, `DELETE /units/:id`.
- **Price levels:** `GET /price-levels`, `POST /price-levels`, `PATCH /price-levels/:id`. Product prices: `GET /products/:id/prices`, `PUT /products/:id/prices` (replace set).
- **Customers:** `GET /customers`, `GET /customers/:id`, `POST /customers`, `PATCH /customers/:id`, `DELETE /customers/:id`. Optional: `GET /customers/:id/balance` (outstanding).
- **Suppliers:** CRUD same pattern as customers.
- **Warehouses:** CRUD; `GET /warehouses` must return at least one (seed default warehouse if empty).
- **Salespersons:** CRUD.
- **Tax profiles:** CRUD; restrict edit to Admin/Accountant if needed.
- **Payment terms:** CRUD or seed only.

All list endpoints support branchId filter (from auth) and pagination (limit, offset) where useful.

---

## 5. Validation (shared)

- Use Zod (or similar) in `packages/shared` for DTOs: CreateProductDto, UpdateProductDto, CreateCustomerDto, etc. Validate in Express (e.g. middleware or in controller) before calling service.

---

## 6. Frontend (React + TanStack Query + Tailwind)

- **Product categories:** Tree view (e.g. recursive component or tree table); add/edit modal or inline; delete with confirmation.
- **Products:** List with filters (category dropdown, search by name/SKU/barcode); product form (tabs or sections: basic, pricing, batch/expiry); barcode field; multiple price levels in form.
- **UoM, Price levels:** Simple list + add/edit modal.
- **Customers:** List + form (type, credit limit, payment terms, tax profile dropdowns).
- **Suppliers, Warehouses, Salespersons:** List + form each.
- **Tax profiles:** List + form (name, rate, inclusive checkbox).
- **Payment terms:** List + form or settings-style page.

Use TanStack Query for all GET (cache, invalidate on mutation); mutations (create/update/delete) invalidate relevant queries. Redux only if you need global selection (e.g. current warehouse) that affects multiple screens. Use Tailwind for layout and components; keep tables and forms consistent with design system.

---

## 7. RBAC

- **Permissions:** e.g. `masters:products:read`, `masters:products:write`, `masters:customers:read`, `masters:customers:write`, `masters:tax:write` (restrict tax to Admin/Accountant). Apply to corresponding routes and hide UI by permission.

---

## 8. Implementation tasks

1. Add entities in `packages/db` for all masters; create and run migrations; seed default warehouse, default UoM, and sample payment terms if needed.
2. Implement product category CRUD and tree API; product CRUD with filters and product prices; UoM and price level CRUD.
3. Implement customer, supplier, warehouse, salesperson, tax profile, payment terms CRUD APIs; add validation DTOs in shared and use in API.
4. Frontend: product category tree and CRUD UI; product list and form (with price levels and batch/expiry); UoM and price level screens.
5. Frontend: customer, supplier, warehouse, salesperson, tax profile, payment terms screens; apply RBAC to menu and buttons.
6. Add audit logging for master entities (categories, products, customers, etc.) via core audit middleware.
7. Optional: customer balance endpoint (sum of unpaid invoices minus receipts) for use in Sales module.

---

## 9. Acceptance criteria

- [ ] All master entities can be created, updated, and soft-deleted via API with correct branch scoping.
- [ ] Product list supports filter by category and search by name/SKU/barcode; product form saves base data and multiple price levels.
- [ ] Customer form includes credit limit, payment terms, and tax profile; supplier and warehouse CRUD work.
- [ ] Tax profile and payment terms are available for use in Sales and Purchase modules.
- [ ] UI respects permissions; audit log records changes to master data.

---

## 10. References

- Main plan: Part B § 2 (Master Data Management).
