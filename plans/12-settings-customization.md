# Feature Plan: Settings & Customization

**Phase:** 1 (MVP) – company, financial year, currency, rounding; Phase 2 – templates, i18n, notifications  
**Depends on:** [01-core-architecture.md](01-core-architecture.md)  
**Tech:** Express, TypeORM, PostgreSQL, React, Redux, TanStack Query, Tailwind

---

## 1. Objective

Centralize company profile, financial year, currency and rounding rules, invoice templates, and (Phase 2) language/localization and notification settings so the rest of the app behaves consistently.

---

## 2. Scope

### 2.1 Company profile (Phase 1)

- **Fields:** Company name, legal name, address (line1, line2, city, state, postalCode, country), phone, email, tax registration number (e.g. VAT/GST), logo (URL or file reference).
- **Usage:** Invoice header, PDF reports, statement header; shown in Settings and editable by Admin.

### 2.2 Financial year (Phase 1)

- **Fields:** Start month (e.g. 1 = January, 7 = July); current year label (e.g. “FY2024”).
- **Usage:** Period locking (Phase 2), report default periods (e.g. “This financial year”); date pickers and report filters.

### 2.3 Currency and rounding (Phase 1)

- **Fields:** Default currency code (e.g. USD, PKR, SAR); decimal places for money (default 2), for quantity (default 2 or 3); rounding rule (half-up, half-down, etc.).
- **Usage:** All monetary and quantity calculations and display; invoice totals; report numbers.

### 2.4 Invoice templates (Phase 1–2)

- **Storage:** Template id or name; layout options (which fields to show: logo, tax number, payment terms, etc.). Store in DB (e.g. settings key-value or template table) or as files.
- **Rendering:** Server or client: merge company + invoice data into template; generate PDF (see Sales plan). Allow “Default” template and optional second template (e.g. “Simplified”) selectable per invoice or in settings.

### 2.5 Language and localization (Phase 2)

- **i18n:** react-i18next (or similar); translation keys for UI strings; date and number formats from locale (e.g. DD/MM/YYYY vs MM/DD/YYYY).
- **Settings:** Default language; optional per-user language later.

### 2.6 Notifications (Phase 2–3)

- **In-app:** Table user_notifications (userId, type, title, body, readAt?, createdAt); e.g. “Low stock: Product X below minimum.” List in header (bell icon); mark as read.
- **Settings:** Notification preferences (which types to show); optional email later (Phase 3).

---

## 3. Data model (TypeORM)

- **CompanySettings** or key-value: id, key, value (json or text), branchId? (or single row per branch). Keys: companyName, legalName, address (json), phone, email, taxRegistrationNumber, logoUrl; financialYearStartMonth, currencyCode, moneyDecimals, quantityDecimals, roundingMode; defaultInvoiceTemplateId?.
- **InvoiceTemplate** (optional) – id, name, config (json: layout options), branchId?.
- **UserNotification** (Phase 2) – id, userId, type, title, body, readAt, createdAt.
- **NotificationPreference** (Phase 2) – userId, type, enabled (boolean).

---

## 4. API (Express)

- **Settings:** GET /settings (returns all keys for current branch or global); PATCH /settings (body: key-value map). Restrict to Admin or specific permission (e.g. settings:write).
- **Company profile:** GET /settings/company; PATCH /settings/company (same as above with nested object).
- **Invoice templates:** GET /invoice-templates; POST /invoice-templates; PATCH /invoice-templates/:id; GET /invoice-templates/:id (for PDF generation).
- **Notifications (Phase 2):** GET /notifications (list for current user; unread count); PATCH /notifications/:id/read; POST /notifications/read-all.
- **Locale:** GET /settings/locale (language, dateFormat, numberFormat); PATCH by Admin (Phase 2).

---

## 5. Frontend (React)

- **Settings layout:** Sidebar or tabs: Company, Financial year, Currency & rounding, Invoice template, Notifications (Phase 2), Language (Phase 2).
- **Company:** Form with all fields; logo upload or URL; save and show preview (e.g. invoice header snippet).
- **Financial year:** Dropdown for start month; display current FY label.
- **Currency & rounding:** Currency code dropdown or input; decimals for money and quantity; rounding rule dropdown.
- **Invoice template:** List templates; add/edit (form or simple editor for layout options); preview with sample data.
- **Notifications:** Bell icon in header with unread count; dropdown or page with list; mark as read. (Phase 2.)
- **Language:** Dropdown to change UI language; persist in Redux or user preference. (Phase 2.)

Use TanStack Query for GET settings; mutation to PATCH; invalidate after save. Redux: app slice can hold current locale and rounding mode for use across components.

---

## 6. Implementation tasks

1. Add CompanySettings (or key-value) entity and migration; seed default keys (company name placeholder, currency USD, financial year start 1, decimals 2).
2. Implement GET/PATCH /settings (and /settings/company if nested); enforce Admin or settings:write.
3. Frontend: Settings page with Company, Financial year, Currency & rounding sections; load and save via API.
4. Invoice template: add entity and CRUD; integrate template selection in invoice PDF generation (Sales module); add template editor or simple form in Settings.
5. (Phase 2) UserNotification entity and APIs; create notifications when e.g. low stock (call from Inventory or scheduled job); notification bell and list in header; mark as read.
6. (Phase 2) i18n: add react-i18next; extract strings to keys; add language selector in Settings; date/number formatters from locale.
7. Document: which settings affect calculations (rounding, currency) and where they are used.

---

## 7. Acceptance criteria

- [ ] Company profile can be edited and is reflected in invoice header and report headers.
- [ ] Financial year start and currency/rounding are saved and used in reports and invoice calculations.
- [ ] Invoice template can be selected and customized; PDF uses selected template.
- [ ] (Phase 2) Notifications appear for configured events; user can see and mark as read.
- [ ] (Phase 2) Language and date/number format can be changed and persist.

---

## 8. References

- Main plan: Part B § 12 (Settings & Customization). Sales PDF: [04-sales-invoicing.md](04-sales-invoicing.md). Reporting: [09-reporting-analytics.md](09-reporting-analytics.md).
