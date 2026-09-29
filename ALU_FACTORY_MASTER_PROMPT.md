# ALU FACTORY — Master Prompt
### Builder-Agnostic | Production-Grade | Full ERP for Aluminum Factory Operations

---

## ROLE & MISSION

You are a senior full-stack web application architect with 10+ years of experience building production ERP systems. Your task is to build **ALU FACTORY** — a complete, real, production-quality ERP web application for an aluminum factory. This is not a demo, not a mockup, and not a tutorial project. Every module must work correctly, persist data reliably, and handle real business operations from day one.

Do not stop at a visual shell. Implement every feature described below: database schema, backend logic, frontend UI, validations, calculations, exports, and access control — all fully functional and synchronized.

---

## PART 1 — PRODUCT IDENTITY

**App Name:** ALU FACTORY
**Logo:** Industrial factory icon — white illustration on Royal Blue (`#1B5DB1`) rounded square background. Use this as the app icon, sidebar brand mark, login screen logo, invoice header, and PDF report header.
**Tagline (optional):** Aluminum Operations Management

### Brand Tokens
```
Primary Blue:      #1B5DB1
White:             #FFFFFF
Light Blue Tint:   #E8F0FB  (card backgrounds, hover states)
Danger Red:        #D93025  (losses, due balances, deletions, negative values)
Success Green:     #1E8A44  (profits, cash received, confirmations)
Page Background:   #F5F7FA
Text Primary:      #1A1F36
Text Secondary:    #6B7280
Border:            #E2E8F0
Font:              Inter (or equivalent clean sans-serif)
Border Radius:     8px standard, 12px cards
Shadow:            0 1px 4px rgba(0,0,0,0.08)
```

### UI/UX Principles
- Clean, premium, industrial-professional — not decorative, not playful
- Strong typographic hierarchy — every number readable at a glance
- Royal Blue is the anchor color — sidebar, primary buttons, key metric headings
- Generous white space — no visual clutter
- Fully responsive — desktop and mobile are equally important, not afterthoughts
- Motion only on user-triggered actions (open, confirm, expand) — no background animations
- Every empty state is a clear invitation to act — never a blank screen

---

## PART 2 — LANGUAGES & CURRENCIES

### Languages
- **Default:** English
- **Secondary:** Kurdish Sorani (کوردی سۆرانی)
- Language toggle available on login screen and in Settings
- When Kurdish Sorani is active: full interface switches to RTL layout automatically
- All UI labels, navigation, buttons, alerts, and messages must be translated in both languages
- Customer names, product names, and notes support Arabic/Kurdish characters at all times

### Currencies
- **Primary:** USD (United States Dollar)
- **Secondary:** IQD (Iraqi Dinar)
- A single configurable exchange rate (1 USD = X IQD) is set and saved by the Owner in Settings
- Exchange rate is editable at any time — every change is logged with timestamp
- On any transaction: user selects which currency the transaction is in AND which vault to use
- If transaction currency ≠ vault currency → exchange rate is applied automatically and displayed transparently inline on the form
- Both vaults display their native currency balance; a USD-equivalent total is shown on the dashboard

---

## PART 3 — AUTHENTICATION & USER ROLES

### Authentication
- Secure email + password login
- Session persistence (user stays logged in across browser sessions)
- Password reset flow via email
- Login screen: ALU FACTORY logo centered, language toggle top-right, clean minimal layout

### Role: Owner
- The **first account to sign up** is automatically and permanently assigned the Owner role
- Owner has unrestricted access to every module, action, and setting
- Owner-exclusive capabilities: User Management, Backup & Restore, Scheduled Email Reports, Exchange Rate Settings, Audit Log

### Role: Custom Users (created by Owner only)
- Owner creates users manually: Full Name + Email + Password
- For each user, Owner sets per-page access via individual ON/OFF toggle switches
- Toggleable pages: Dashboard · Customers · Beneficiaries · Inventory · Point of Sale · Vault · Reports · Settings
- Access is enforced on both frontend (pages hidden/inaccessible) and backend (API routes protected)
- Users cannot view or modify their own permissions
- Owner can deactivate any user account at any time

---

## PART 4 — DASHBOARD MODULE

The command center. Loads immediately after login. Gives a complete business health snapshot.

### Summary Cards (Top Row — 6 cards)
1. **Total Sales This Month** — sum of all POS invoice totals in the current calendar month
2. **Total Sales All Time** — sum of all POS invoice totals ever recorded
3. **Overall Profit / Loss** — `SUM(all sale totals) − SUM(all purchase totals)` — displayed in large type, green if positive, red if negative — this is the most important number in the system
4. **Vault Balance** — USD vault balance + IQD vault balance converted to USD equivalent using current exchange rate
5. **Best Customer** — customer with highest total purchase value, shown with name and amount
6. **Best Beneficiary** — beneficiary with highest total transaction volume with the factory

### Charts Section (below cards)
- **Monthly Profit/Loss Bar Chart** — one bar per month, green for profit, red for loss — prominent, above the fold
- **Sales by Month** — line or bar chart showing revenue trend
- **Top 5 Customers by Value** — horizontal bar chart
- **Top 5 Beneficiaries by Purchase Volume** — horizontal bar chart
- All charts update automatically when any transaction is added, edited, or deleted

### Recent Transactions Table (below charts)
- Shows the latest 3 transactions across all modules (purchases + sales)
- Columns: #, Date, Type (Purchase/Sale), Party Name, Amount, Currency, Status
- "View All Transactions" button → expands to full history subpage

### Alerts Panel
- Non-intrusive notification bell icon in the top navigation bar
- Badge count shows unread alerts
- Alert types (all configurable in Settings):
  - Customer due balance exceeds threshold
  - Factory due balance to beneficiary exceeds threshold
  - Inventory item weight below low-stock threshold
  - Vault balance below configured minimum
  - Payment overdue beyond configured number of days
- Clicking an alert navigates directly to the relevant record

---

## PART 5 — CUSTOMERS MODULE

The most critical module. Manages all customer relationships, balances, and transaction history.

### Customer List Page
- Clean card or table list of all customers
- Each entry shows: Profile picture (or initials avatar), Full Name, Phone, Balance Status badge
- Balance badge: green "In Credit" (we owe them nothing / they are current) or red "Due: $X.XX" (they owe the factory)
- Search by name, filter by balance status
- "Add Customer" button top-right → opens Add Customer form

### Add / Edit Customer Form
| Field | Required | Notes |
|---|---|---|
| Full Name | ✅ | Must be unique — no two customers with identical names |
| Phone Number | Optional | Pre-filled with +964 country code prefix |
| Address | Optional | Free text |
| Profile Picture | Optional | Image upload, displayed as avatar |

- All optional fields editable at any time from the customer's page
- Starting balance is zero for all new customers

### Customer Account Page (per-customer subpage)
Opened by clicking any customer from the list.

**Header:**
- Customer name, profile picture, phone, address
- Three balance cards:
  - **Cash Received** — total cash collected from this customer
  - **Due Balance** — labeled explicitly: **"Customer owes factory"** — red if > 0
  - **Net Position** — total sales to this customer minus total collected

**Balance Chart:**
- Line chart showing customer's due balance trend over time

**Per-Customer Profit:**
- Calculated as: `SUM(sale totals to this customer) − SUM(cost of goods sold to this customer)`
- Displayed as an indicator card on their page

**Transaction History Table:**
| Column | Notes |
|---|---|
| Invoice # | Auto-incremented, e.g. INV-00001 |
| Date | DD/MM/YYYY |
| Products | Summary of line items |
| Total Amount | |
| Cash Paid | |
| Due Amount | Color-coded red if > 0 |
| Vault Used | USD or IQD |
| Currency | |
| Actions | View Invoice · Edit · Delete |

- Search, filter by date range, sort all columns
- Pagination: 25/50/100 rows per page

**Export:**
- "Export Account Statement" → branded PDF titled with customer name, date range selector
- "Export CSV" → raw transaction data

---

## PART 6 — BENEFICIARIES MODULE

Where raw aluminum is purchased from suppliers.

### Beneficiary List Page
- Same structure as Customers list
- Balance badge shows: **"Factory owes beneficiary: $X.XX"** (red) or **"Settled"** (green)
- Search by name, filter by balance status

### Add / Edit Beneficiary Form
| Field | Required |
|---|---|
| Full Name | ✅ |
| Phone Number | Optional (+964 prefix) |
| Address | Optional |

### Beneficiary Account Page
- Same structure as Customer Account Page
- Due balance card explicitly labeled: **"Factory owes beneficiary"**
- Full purchase history table
- PDF + CSV export of account statement

### Purchase Transaction Form
Fields:
- **Date** — date picker, default today (DD/MM/YYYY)
- **Beneficiary** — searchable dropdown from beneficiary list
- **Product Name** — text input; autocompletes from existing inventory names
- **SKU Code** — text input; autocompletes from existing SKUs; or enter new SKU for new product
- **Aluminum Type** — searchable select: 6061 / 6063 / Mixed / Scrap / Extrusion / custom entry allowed
- **Weight (kg)** — numeric, > 0, decimals allowed, required
- **Unit Price** — numeric, > 0, decimals allowed, required
- **Currency** — USD or IQD selector
- **Total Price** — AUTO-CALCULATED, read-only: `Weight × Unit Price` — displayed prominently, recalculates instantly on any change
- **Vault** — select USD vault or IQD vault
- **Exchange Rate Note** — shown inline if vault currency ≠ transaction currency, showing the rate applied and converted amount
- **Cash Paid** — numeric, ≥ 0
- **Due Amount** — AUTO-CALCULATED, read-only: `Total − Cash Paid` — labeled **"Factory owes beneficiary"**, shown in red if > 0
- **Notes** — optional free text

On submission:
1. Validate all required fields
2. Recalculate Total and Due server-side — never trust client values
3. Save transaction
4. Add/update inventory item (Name + SKU + weight added to stock)
5. Deduct cash paid from selected vault
6. Update beneficiary balance
7. Refresh all dashboard stats
8. Show success notification

---

## PART 7 — INVENTORY MODULE

Tracks all raw aluminum stock from purchase through processing to available-for-sale state.

### Inventory List
| Column | Notes |
|---|---|
| SKU | Unique code |
| Product Name | |
| Aluminum Type | |
| Total Purchased (kg) | All-time cumulative |
| Total Processed (kg) | After loss |
| Available (kg) | Remaining sellable weight |
| Status | In Stock (green) · Low Stock (orange) · Out of Stock (red) |
| Actions | Process Loss · Restock · View History |

- Low Stock threshold configurable per item (default: 50kg, editable in Settings)
- Search by SKU or name, filter by status

### Loss / Processing Entry
Opened via "Process Loss" button on any inventory item.

**Loss Entry Form:**
- Product name + SKU (pre-filled, read-only)
- Current available weight (pre-filled, read-only)
- **Option A — By Percentage:**
  - Enter loss percentage (e.g. 8)
  - Live preview shown instantly below the field as placeholder text:
    *"Result: 920.00 kg available after 8% loss from 1,000 kg"*
  - Formula: `Remaining = Original × (1 − Loss% / 100)`
- **Option B — Manual Weight:**
  - Enter exact remaining weight directly
  - System calculates and displays the implied loss % as a note
- User picks either option — both are always available
- Date of processing (default today)
- Notes field (optional)

On submission:
- Original weight, loss amount, loss %, remaining weight, and date all recorded
- Inventory available weight updated
- Processing event logged in item's history

### Item History (per item subpage)
Full log: purchases in, loss events, sales out, restocks — with dates and amounts.

### Restock
- "Restock" button on any item → opens Beneficiary Purchase form pre-filled with that item's Name and SKU
- User completes the purchase as normal; stock is added automatically

---

## PART 8 — POINT OF SALE MODULE

Where processed aluminum is sold to customers.

### POS Layout
Split into two panels:
- **Left / Top:** Sale builder (customer selection + line items)
- **Right / Bottom:** Invoice summary + payment section

### Customer Selection
- Searchable dropdown — pulls from Customers module
- Displays customer name + current due balance as context
- "Add New Customer" shortcut link if customer doesn't exist yet

### Sale Line Items
Each invoice can contain one or more line items. Per line item:

| Field | Behavior |
|---|---|
| Product (Name or SKU) | Searchable — pulls only from processed inventory with available weight > 0 |
| Available Weight | Shown as read-only context next to the product field |
| **[USE MAX]** button | One-click CTA — instantly fills the weight field with the full available weight of the selected product |
| Weight (kg) | Numeric input, > 0, cannot exceed available weight |
| Unit Price (per kg) | Manual entry — user decides price per sale, no default |
| Line Total | AUTO-CALCULATED, read-only: `Weight × Unit Price` — updates instantly |

- "Add Line Item" button adds another row
- Each line item has a remove (×) button
- Running invoice total shown prominently, updates live as lines are added or changed

### Payment Section
- **Currency** — USD or IQD selector (applies to entire invoice)
- **Vault** — select USD vault or IQD vault
- **Exchange Rate Note** — shown inline if mismatch, with converted amount
- **Invoice Total** — sum of all line item totals, large and prominent
- **Payment UI** — visually clear split, not plain fields:
  - Cash Paid input — user enters amount received
  - Due Amount — AUTO-CALCULATED (`Total − Cash Paid`), labeled **"Customer owes factory"**, shown in red if > 0
  - Visual progress bar or split indicator showing cash vs due proportion
- **Notes** — optional per-invoice notes

### Submission
Button: **"Confirm Sale & Generate Invoice"**

On click:
1. Validate all fields (no missing products, weight within available, price > 0)
2. Confirm no line item exceeds available inventory
3. Recalculate all totals server-side
4. Save invoice with auto-incremented number (INV-00001, INV-00002...)
5. Deduct each line item's weight from inventory
6. Add cash paid to selected vault
7. Update customer due balance
8. Update dashboard stats
9. Generate A5 PDF invoice instantly
10. Show invoice preview with Download button
11. Show success notification
12. Reset POS form for next sale

Disable submit button during processing to prevent duplicates.

### Invoice Specification (A5 PDF)
```
┌─────────────────────────────────┐
│  [LOGO]   ALU FACTORY           │
│           Invoice #INV-00001    │
│           Date: DD/MM/YYYY      │
├─────────────────────────────────┤
│  Customer: [Name]               │
│  Phone: [+964...]               │
├──────┬──────────┬───────┬───────┤
│ SKU  │ Product  │  Wt.  │ Price │  Total │
├──────┼──────────┼───────┼───────┤
│ ...  │ ...      │ ...kg │ $X.XX │ $X.XX  │
├─────────────────────────────────┤
│              TOTAL:    $XXX.XX  │
│         CASH PAID:    $XXX.XX  │
│        DUE BALANCE:    $XXX.XX  │
│           CURRENCY:    USD/IQD  │
│     EXCHANGE RATE:  1USD=XIQD  │
│            (if applicable)      │
├─────────────────────────────────┤
│  Authorized: _______________    │
└─────────────────────────────────┘
```
- Paper size: A5
- Style: Clean, professional, minimal — not decorative
- Logo top-left, invoice details top-right
- Line items in a clean table
- Footer: cash paid, due balance, exchange rate if applied, signature line
- Font matches app brand (Inter or equivalent)

---

## PART 9 — VAULT MODULE

The financial core of the system. Every transaction in every module passes through a vault.

### Vault Display
Two vault cards, displayed large and prominent — not small widgets:

**USD Vault Card:**
- Current Balance (large number, green if positive, red if negative)
- Total Deposited (all time)
- Total Withdrawn (all time)
- Mini chart: balance over last 30 days

**IQD Vault Card:**
- Same structure as USD vault
- Equivalent USD value shown below IQD balance (using current exchange rate)

### Exchange Rate Display
- Shown prominently between or above the two vault cards
- Format: `1 USD = X,XXX IQD`
- "Edit Rate" button → inline edit → save → rate change logged
- Rate change log viewable in Settings

### Direct Vault Operations
**Deposit:**
- Select vault (USD or IQD)
- Amount
- Date (default today)
- Source label (e.g. "Cash deposit", "Bank transfer")
- Notes (optional)
- Recorded in vault transaction history

**Withdraw:**
- Select vault
- Amount
- Date
- Reason label (e.g. "Operating expense", "Supplier payment")
- Notes (optional)
- Recorded in vault transaction history

### Vault Transaction History Table
| Column | Notes |
|---|---|
| Date | DD/MM/YYYY |
| Type | Purchase · Sale · Deposit · Withdrawal · Exchange |
| Reference | Invoice # or transaction # |
| Description | Auto-generated or user note |
| Amount | Colored: green for in, red for out |
| Currency | USD / IQD |
| Balance After | Running balance |

- Filter by vault, date range, transaction type
- Sort all columns
- Pagination 25/50/100
- Export: PDF and CSV

### Negative Balance Behavior
- System does NOT block transactions that would make a vault go negative
- Negative balance displayed clearly in red with label: **"Deficit: -$X.XX"**
- Alert triggered when balance goes negative

---

## PART 10 — REPORTS MODULE

### Available Reports
All reports support: custom date range selector, PDF export, CSV export, print layout.

| Report Name | Contents |
|---|---|
| **Overall P&L Report** | Revenue vs Cost, gross profit, net profit, month-by-month breakdown table + chart |
| **Sales Report** | All POS sales — filterable by customer, product/SKU, date, currency |
| **Purchase Report** | All beneficiary purchases — filterable by beneficiary, product/SKU, date |
| **Customer Due Aging Report** | All customers with due balances, bucketed by age: 0–30 / 31–60 / 61–90 / 90+ days |
| **Beneficiary Due Aging Report** | All beneficiaries factory owes money to, same aging buckets |
| **Inventory Movement Report** | Per-item: purchased in, losses applied, sold out, remaining balance — with dates |
| **Vault Balance History** | USD and IQD vault movements over time, running balance chart |
| **Best Customers Report** | Ranked by total purchase value — with transaction count, total paid, total due |
| **Best Beneficiaries Report** | Ranked by purchase volume and value |

### PDF Export (all reports)
- Header: ALU FACTORY logo + Report Name + Date Range + Generated: DD/MM/YYYY HH:MM
- Clean table layout — A4 landscape where table is wide
- Page numbers in footer
- Summary statistics above the main table

### Scheduled Auto-Email (Owner only — configured in Settings)
- **Daily email:** Total sales today, vault balances, transaction count, top alerts summary
- **Weekly email:** Full P&L, inventory status, top 3 customers and beneficiaries, due aging summary
- Owner sets email address and toggles daily/weekly/both in Settings

---

## PART 11 — SETTINGS MODULE

### Exchange Rate
- Set and save current USD ↔ IQD rate
- Rate history log: timestamp, old rate, new rate, changed by

### Aluminum Types Management
- Add / Edit / Delete aluminum types used across the app
- Default set: 6061, 6063, Mixed, Scrap, Extrusion
- Used as autocomplete suggestions in all forms — new custom types still allowed

### Inventory Thresholds
- Set low-stock alert threshold (in kg) — global default + per-item override

### Notification Settings
- Toggle each alert type on/off
- Set thresholds for due balance alerts (e.g. alert when due > $500)
- Set overdue payment threshold (e.g. alert when unpaid > 30 days)

### Email Reports (Owner only)
- Email address for scheduled reports
- Toggle: Daily report ON/OFF
- Toggle: Weekly report ON/OFF

### Language
- Toggle between English and Kurdish Sorani
- Preference saved per user account

### Backup & Restore (Owner only)
- **Auto-backup:** system creates backups automatically (daily recommended)
- **Backup list:** table of all backups with timestamp, size, download button
- **Manual Export:** "Export Full Backup" → downloads complete database as JSON and/or Excel
- **Restore:** upload a backup file → system restores to that point → confirmation required before execution
- Backup/restore actions logged in audit trail

### User Management (Owner only)
- Table of all users: Name, Email, Role, Status (Active/Inactive), Last Login
- "Create User" → Full Name + Email + Password + per-page access toggles
- "Edit User" → modify name, password, or access toggles
- "Deactivate User" → user can no longer log in (not deleted — data preserved)
- Owner account cannot be deactivated

### Audit Log (Owner only)
- Full log of every create, edit, delete, login, permission change, backup, and restore
- Columns: Timestamp, User, Action, Module, Record Reference, Details
- Filterable by user, action type, date range
- Exportable as PDF/CSV

---

## PART 12 — CORE BUSINESS LOGIC

### Mandatory Auto-Calculations (NEVER accept from user input — always calculate server-side)
```
Purchase Total Price  = Weight (kg) × Unit Price
Sale Line Total       = Weight (kg) × Unit Price
Invoice Total         = SUM(all line item totals)
Due Amount            = Total − Cash Paid
Exchange Amount       = Amount × Exchange Rate
Loss Result (kg)      = Original Weight × (1 − Loss% / 100)
Implied Loss%         = ((Original − Remaining) / Original) × 100
Per-Customer Profit   = SUM(sales to customer) − SUM(COGS for those sales)
Overall P&L           = SUM(all invoice totals) − SUM(all purchase totals)
Weighted Avg Buy Price = SUM(purchase totals) / SUM(purchase weights)
```

### Data Integrity Rules
- Total Price, Due Amount, and all derived values recalculated on the server before saving — client-displayed values are for UX only and are never trusted
- Inventory deducted only after confirmed sale submission — never before
- Vault balance updated only after confirmed transaction — never optimistically
- If any server-side calculation result differs from client-submitted value → use server result, log discrepancy
- Transaction numbers and invoice numbers are generated server-side and are unique, sequential, and tamper-proof

### Due Balance Labeling (always explicit — never ambiguous)
- Customer side: **"Customer owes factory"**
- Beneficiary side: **"Factory owes beneficiary"**
- These exact labels must appear wherever a due balance is displayed

### Transaction Editing
- All transactions (purchases, sales, vault direct ops) are editable
- Editing loads transaction into form, which displays: **"EDITING [TYPE] #XXXXX"** + Cancel button
- On update: all dependent values recalculated, inventory and vault effects reversed then reapplied correctly
- Original transaction ID and number preserved — no duplicates created

### Transaction Deletion
- Confirmation dialog shows full transaction details and the text: **"This action cannot be undone."**
- On confirmed delete: inventory effect reversed, vault effect reversed, customer/beneficiary balance updated
- Deletion logged in audit trail with: user, timestamp, deleted record details

---

## PART 13 — VALIDATION RULES

Applied on both frontend (instant feedback) and backend (before saving).

| Field | Rules |
|---|---|
| Weight (kg) | Required · Numeric · > 0 · Decimals allowed |
| Unit Price | Required · Numeric · > 0 · Decimals allowed |
| Cash Paid | Numeric · ≥ 0 · Decimals allowed |
| Customer Name | Required · Unique across all customers |
| SKU Code | Required · Unique across all inventory items |
| Product Name | Required |
| Exchange Rate | Required when vault ≠ transaction currency · Numeric · > 0 |
| Date | Required · Valid date · Not unreasonably far in future |
| Sale Weight | Cannot exceed current available inventory weight for that product |

Show clear, field-level validation messages — never rely on browser defaults alone.

---

## PART 14 — PERFORMANCE REQUIREMENTS

- Server-side pagination on ALL tables — default 25 rows, options 25/50/100
- Server-side search and filtering — never load entire dataset to client
- Debounced search input (300ms delay before firing query)
- Proper database indexes on: date fields, customer_id, beneficiary_id, product_sku, invoice_number, vault_id
- Skeleton loading states on all data tables while fetching
- Loading indicators on all async buttons during processing
- Submit/Update/Delete buttons disabled during active requests — re-enabled after response

---

## PART 15 — ERROR HANDLING

Never fail silently. Every error shows a specific, actionable message.

| Scenario | Message |
|---|---|
| Save fails | "Transaction could not be saved. Please try again." |
| Update fails | "Transaction could not be updated. Please try again." |
| Delete fails | "Transaction could not be deleted. Please try again." |
| Inventory insufficient | "Insufficient stock: only X kg available for [Product]." |
| Duplicate name | "A customer with this name already exists." |
| Network error | "Connection lost. Check your internet and try again." |
| Auth error | "Session expired. Please log in again." |

---

## PART 16 — EMPTY STATES

Every module and table must have a purposeful empty state — never a blank screen:

- **Customers:** *"No customers yet. Add your first customer to start recording sales."* + [Add Customer] button
- **Beneficiaries:** *"No beneficiaries yet. Add a beneficiary to record your first purchase."* + [Add Beneficiary] button
- **Inventory:** *"No inventory yet. Purchase raw material from a beneficiary to add stock."* + [New Purchase] button
- **POS:** *"No sales yet. Select a customer and add products to create your first invoice."*
- **Vault History:** *"No transactions recorded yet."*
- **Reports:** *"No data found for the selected date range."*

---

## PART 17 — MOBILE BEHAVIOR

On screens < 768px:
- Sidebar collapses to bottom tab bar or hamburger menu
- All data tables convert to scrollable card stacks or horizontally scrollable tables
- POS line items stack vertically
- Submit/confirm buttons are full width
- Touch targets minimum 44px height
- Invoice PDF opens in new tab or triggers download
- Charts remain readable — simplified labels if needed
- No horizontal page overflow anywhere

---

## PART 18 — ACCESSIBILITY

- All form fields have explicit `<label>` elements
- Keyboard navigation works throughout — tab order is logical
- Visible focus states on all interactive elements
- Color is never the only indicator of state (always paired with text or icon)
- Sufficient text contrast — WCAG AA minimum
- Semantic HTML throughout (nav, main, section, table headers, button types)
- Arabic and Kurdish Sorani text renders correctly with proper RTL support

---

## PART 19 — SECURITY

- All API routes are authenticated — no data accessible without valid session
- Per-page access enforced on API level — not just hidden in the UI
- Passwords hashed with bcrypt or equivalent — never stored in plain text
- No secrets or database credentials in frontend code
- All user input sanitized before storage
- Rate limiting on login endpoint to prevent brute force
- SQL injection protection via parameterized queries or ORM

---

## PART 20 — FINAL QUALITY CHECKLIST

Before considering the application complete, verify these scenarios work end-to-end:

**Test 1 — Full Purchase Flow:**
Buy 500kg of 6063 aluminum from a beneficiary at $2.50/kg. Pay $800 cash from USD vault. Verify: total = $1,250, due to beneficiary = $450, inventory shows 500kg available, vault deducted $800.

**Test 2 — Loss Process:**
Apply 10% loss to 500kg. Verify: preview shows "450 kg available after 10% loss", inventory updates to 450kg after confirmation.

**Test 3 — Full Sale Flow:**
Sell 200kg to a customer at $3.20/kg. Customer pays $400 cash. Verify: invoice total = $640, due from customer = $240, inventory deducted 200kg, vault increased $400, customer balance shows "Customer owes factory: $240".

**Test 4 — MAX Button:**
In POS, select a product with 450kg available. Click [USE MAX]. Verify: weight field fills with 450.

**Test 5 — Exchange Rate:**
Set rate to 1 USD = 1,480 IQD. Create a sale in IQD paid into USD vault. Verify: converted amount shown correctly, vault updated in USD.

**Test 6 — Dual Currency Vault:**
Deposit 500,000 IQD into IQD vault. Verify: IQD vault balance updates, dashboard shows USD equivalent.

**Test 7 — User Access Control:**
Create a user with only Customers and POS enabled. Log in as that user. Verify: only those two modules are visible and accessible. Vault and Reports are completely inaccessible.

**Test 8 — Kurdish Sorani:**
Switch language to Kurdish Sorani. Verify: full interface renders in RTL, all labels translated, numbers and dates still display correctly.

**Test 9 — Persistence:**
Create a purchase, a sale, and a vault deposit. Refresh the browser. Verify: all three records still exist and all balances are correct.

**Test 10 — Profit Accuracy:**
Buy 1,000kg at $2.50 ($2,500 total cost). Sell 600kg at $3.50 ($2,100 revenue). Verify dashboard P&L shows the correct overall profit/loss figure.

---

## FINAL INSTRUCTION

Build the complete application from this specification. Do not stop at a visual mockup. Do not build placeholder screens. Implement every module, every calculation, every validation, every export, and every role-permission rule described above — fully functional, fully connected, fully persisted.

The finished application must feel and function like a real aluminum factory ERP system used daily by a real business. Prioritize in this order:

1. Correct, server-verified calculations
2. Reliable data persistence
3. Accurate vault and inventory sync
4. Clean, labeled due balance tracking
5. Excellent validation and error handling
6. Fast search, filtering, and pagination
7. Professional, branded UI
8. Responsive mobile experience
9. Role-based access control
10. PDF invoice and report generation

Use clean, modular, maintainable architecture. Structure the codebase so that additional modules (payroll, multi-branch, barcode scanning) can be added later without rebuilding what already exists.

---
*ALU FACTORY Master Prompt — Version 1.0 — September 2026*
*Builder-agnostic. Compatible with any AI app builder or development team.*
