
Here is a **TradeFlow end-user guide** based on how the app is built today. It assumes you use the desktop app after your administrator has set up the server, database, and your account.

---

# TradeFlow — User guide

## What TradeFlow is

**TradeFlow** helps you run day-to-day **distribution and trading** work in one place: **products and customers**, **stock in warehouses**, **sales** (quotes through to money in), **purchases** (orders through to payments), **basic accounting**, **reports**, and optional **delivery routes and runs**.

---

## Signing in and finding your way around

### Login

1. Open the TradeFlow app.
2. Enter the **email** and **password** your administrator gave you.
3. Click **Sign in**.  
   If login fails, check caps lock and spelling, or ask your admin to reset your password or confirm your account.

### Main screen

- **Left sidebar** — main areas (Dashboard, Settings, masters, inventory, sales, and so on). Click the **menu (☰)** at the top of the sidebar to **widen or narrow** it.
- **Top bar** — your **name**, **Logout**, and sometimes **Branch** and a **notification bell** (with a number if there are unread items).

### Working in the right branch

If your company uses **more than one branch**, use the **Branch** dropdown in the top bar. **Figures and documents follow the branch you select.** Always confirm the correct branch before entering sales, purchases, or stock.

### What you can see depends on your role

Some menu items **only appear if your permissions allow them**. If something is missing, ask your administrator; it is usually intentional, not a bug.

---

## Dashboard

**Dashboard** is the home page after login.

If you have access to **sales or purchase reporting**, you may see:

- **Sales today** and **sales month-to-date (MTD)**
- **Invoices posted today**
- **Purchases today** and **purchases MTD**
- **Receivables** — money customers still owe, with **aging** (Current, 1–30 days, 31–60, 61–90, 90+)
- **Payables** — money you still owe suppliers

You also get **shortcuts** to common reports (operational, aging, financial).

---

## Settings (company profile)

Open **Settings** from the sidebar (if you have access).

Typical sections:

- **Company** — name, address, phone, tax number, **logo** (often a web link to an image), used on invoices and reports.
- **Financial year** — when your financial year starts and how it is labeled.
- **Currency and rounding** — currency code, how many decimals money and quantities use, **rounding mode**, and **inventory costing method** (for example FIFO), which affects how stock value is calculated.
- **Invoice templates** — layouts for printed/PDF invoices (what to show: logo, legal name, tax number, payment terms, notes).

Use **Save** where shown. If fields are greyed out, you only have view access.

---

## Master data (“the lists” everything else uses)

These screens define **who and what** you trade with. Set them up **before** heavy daily use (or use **Import** for bulk load).

| Area | What it is for |
|------|----------------|
| **Categories** | Groups for products (for organization and reporting). |
| **Products** | Items you buy and sell: codes (SKU), names, prices, links to categories/units, etc. |
| **Units** | How you measure products (each, box, kg, …). |
| **Price levels** | Named price lists or tiers (if your business uses them). |
| **Customers** | Who you sell to; often linked to **payment terms** and **tax profiles**. |
| **Suppliers** | Who you buy from. |
| **Warehouses** | Places where stock is stored. |
| **Salespersons** | Staff linked to sales where needed. |
| **Tax profiles** | Rules for tax on lines (names/setup your accountant or admin defines). |
| **Payment terms** | When payment is due (e.g. Net 30). |

**Tip:** Consistent **codes** and **names** make **Import** and reports much easier.

---

## Import

**Import** is for **bulk loading** from a spreadsheet (Excel or CSV), not for one-off edits.

- **Products** — uses **category** and **unit codes**; download a template, fill it, upload; errors are reported **by row**.
- **Customers** — can match **payment terms** and **tax profiles** by name.
- **Opening balances** — starting **inventory per warehouse** (and optionally balanced journal-related sheets where applicable).

If Import is missing, you need **write** permission on the related area (products, customers, or inventory).

---

## Inventory

Use the **Inventory** item in the sidebar, then the **tabs** along the top of the inventory section:

| Tab | Purpose |
|-----|--------|
| **Stock** | **Current quantities** by product and warehouse; optional filters. Shows value using **stock layers** (FIFO/LIFO/FEFO style) where applicable vs. product cost. |
| **Movements** | **History** of ins and outs (audit trail for stock). |
| **Transfers** | Move stock **between warehouses**. |
| **Opening balance** | Set **starting quantities** when you begin using the system or a new warehouse (restricted to users who can write inventory). |
| **Adjustment** | Correct stock (damage, count differences, etc.) (write permission). |

**Tip:** Do **opening balance** or imports **before** relying on stock levels for sales and purchasing.

---

## Sales

Sidebar: **Sales** (opens at **Quotations**). Sub-tabs:

### Quotations

Price offers for customers. Lines include **product, quantity, price, discounts, tax**. You can set **valid until** and **notes**. Status tracks whether a quote is still open or has progressed.

### Sales orders

**Customer orders** you intend to fulfill—often after a quotation or as a direct order. Used to plan **delivery** and **invoicing**.

### Invoices

**Bills to customers** for delivered goods or services. Posting invoices usually affects **accounts receivable** and **stock** (depending on setup and status).

### Receipts

**Money received** from customers against invoices (cash, bank, etc., as configured).

### Statement & aging

**Sales-side statements and aging** — who owes what and how old balances are.

---

## Purchases

Sidebar: **Purchases**. Sub-tabs:

### Purchase orders (PO)

**Orders you place with suppliers**: supplier, warehouse, dates, lines with products, prices, discounts, tax. May have **status** and **post** steps depending on your process and permissions.

### Goods receipt (GRN)

**Recording goods arriving** against purchase orders. This is where **stock usually increases** when material is received.

### Supplier invoices

**Bills from suppliers** matched to your purchasing/receipt flow; drives **payables**.

### Payments

**Payments you make** to suppliers, reducing what you owe.

### Statement & aging

**Purchase-side statements and aging** — what you owe and how it ages.

**Typical flow:** PO → **receive (GRN)** → **supplier invoice** → **payment**.

---

## Accounting

Sidebar: **Accounting**. Sub-tabs:

### Chart of accounts

The **list of accounts** (assets, liabilities, equity, income, expense). Admins can add accounts; some may be **system** accounts that should not be changed casually. Often includes **default cash and bank** accounts for everyday postings.

### Journal entries

**Manual accounting entries** (debits and credits) for adjustments, accruals, or corrections—usually for users trained in bookkeeping.

### Financial reports

**Trial balance**, **profit and loss**, **balance sheet**, **expense analysis** over dates you choose. These tie to your **financial year** and **company settings**. Export/print options may be available on screen.

---

## Reporting & analytics

Sidebar: **Reports**. This hub groups:

- **Operational** — e.g. daily sales, stock movement, **fast movers** (depends on access).
- **Receivables & payables aging** — open balances by bucket.
- **Tax** — tax collected, paid, period summary (with appropriate access).
- **Inventory health** — **low stock**, **dead/slow** movers (with access).
- **Financial statements** — links through to **Accounting → Financial reports** for trial balance, P&amp;L, balance sheet, etc.

The hub explains that **full financial statements** live under **Accounting**.

---

## Logistics (delivery)

If enabled for your role, **Logistics** includes:

| Tab | Purpose |
|-----|--------|
| **Routes** | **Delivery routes** with ordered **stops** (often customers and addresses). |
| **Delivery runs** | **A vehicle/run on a date** on a route—assigning **delivery notes** to a run. |
| **Delivery notes** | Documents for **what goes out on a delivery**, linked to **invoices** or **sales orders**; may support **proof of delivery** (e.g. photo/signature reference). |
| **Reports** | Logistics-related reporting. |

Use this when you plan **who gets delivered what** and **when**, and need a paper trail for deliveries.

---

## Audit logs

**Audit logs** (if you have access) list **who changed what** in the system: user, action, type of record, time, and sometimes old/new values. Use them to **trace mistakes or investigate** discrepancies—often an **admin or finance** task.

---

## Recycle bin

**Recycle bin** holds **soft-deleted** records (for example products, customers, suppliers, invoices, journal entries—types shown in the app). You can **restore** items if you have permission. The app notes that **automatic purge** may not be enabled—ask your administrator about retention.

---

## Notifications

The **bell** in the header can show **unread** counts. It is refreshed periodically; use it for alerts your administrator has wired up.

---

## Logging out

Click **Logout** in the top-right when you finish, especially on a **shared computer**.

---

## Glossary (short)

| Term | Meaning |
|------|--------|
| **SKU** | Stock-keeping unit — your product code. |
| **MTD** | Month-to-date — from the start of the month to today. |
| **AR / receivables** | Money **customers owe you**. |
| **AP / payables** | Money **you owe suppliers**. |
| **Aging** | How long balances have been open (buckets like 1–30 days). |
| **GRN** | Goods receipt note — recording stock **in** from suppliers. |
| **FIFO / LIFO / FEFO** | Ways to value or consume stock layers (first-in-first-out, etc.). |
| **Branch** | A separate slice of data (location or entity) when your company uses branches. |

---

## If something goes wrong

1. Check **branch** and **date** on the screen.  
2. Confirm you have **permission** for that menu.  
3. For **import errors**, fix the **row** indicated and re-upload.  
4. For **stock or money mismatches**, use **movements**, **audit logs**, and **reports** to narrow it down, then involve your **admin or accountant**.

---

