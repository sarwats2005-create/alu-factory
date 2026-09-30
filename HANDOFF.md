# ALU FACTORY ERP — Handoff Summary (for Claude)

**Project:** Next.js 15 (App Router, Turbopack) ERP for an aluminum factory — Prisma + Postgres (Neon; sqlite migration dir also exists), Tailwind v4, React 19. Dev server: `npm run dev` on **port 3400** (`npm run dev > .freebuff/dev.log 2>&1 &` if it dies). Typecheck: `npm run typecheck` (or `npx tsc --noEmit`). Language: English + Kurdish Sorani via `src/lib/i18n.ts` (`t(key, lang)`, `useLang()`, `alu_lang` in localStorage, `alu-lang-change` DOM event, RTL for `ku`). Brand tokens: blue #1B5DB1, dark #143F7A, light #E8F0FB, mid #D0E1F9, stripe #F4F8FF, border #D8E6F7, text #1A1F36, muted #6B7280, green #1E8A44, red #D93025.

App shell: `src/components/AppShell.tsx` (sidebar + mobile bar + bottom tabs, mounted around all `(app)` pages). Global CSS: `src/app/globals.css` (~1700 lines) — **beware**: it contains dark-theme overrides like `html.dark .text-[#1A1F36] { color: var(--text) !important }` that hijack Tailwind arbitrary color classes, and a `.page` class collision. Dark mode is the default (`html.dark` via theme-init script in `src/app/layout.tsx`).

## Work completed this session (all verified, typecheck clean)

### 1. Invoice redesign (approved spec)
- `src/lib/invoice-pdf.ts` — full rewrite. Exports **`invoiceHtml(sale)`**, **`invoiceCss()`** (both shared with the preview), **`printInvoice(sale)`**, **`saveInvoicePdf(sale, opts)`** plus folder-picker helpers (`chooseInvoiceDir`, `getSavedDir`, `fsAccessSupported`).
- Template: blue header (grid `1fr auto 1fr` so "ALU FACTORY" stays optically centered), gradient accent strip, "Bill To" customer band + pill badge, banded line-items table (odd rows white, even #F4F8FF; SKU badge; `unicode-bidi: plaintext` for Arabic/Kurdish product names), boxed totals (Total row blue top-border; Cash Paid green; Due Balance muted gray at 0, red+bold with "Customer owes factory" sub-label when > 0), signature footer, 6px blue closing bar. Root class is **`.inv-page`** (NOT `.page` — that collides with globals.css). All brand tokens are defined **on `.inv-page` itself, not `:root`** — globals.css redefines `--text` on `html.dark` with higher specificity, which previously turned body text white-on-white.
- Strings are HTML-escaped via local `esc()`. Sale record: `sale.invoiceNo, saleDate, totalAmount, cashPaid, dueAmount, currency (USD/IQD), exchangeRate, customer.fullName, lineItems[{item:{sku,name}, weightKg, unitPrice, lineTotal}]`.
- **Known latent bug (I fixed one instance; check for others):** the root class was renamed `.page` → `.inv-page`; any code still querying `.page` will break. `renderCanvas` queries `.inv-page` now — verified.

### 2. PDF export fix
- `saveInvoicePdf` uses html2canvas (scale 2) → jsPDF A5 portrait (148mm, `compress: true`), saves to user-picked folder (File System Access API, handle persisted in IndexedDB `alu-invoice-pdfs`/key `invoiceDir`) or falls back to download.
- **Critical bug fixed:** the offscreen render host was built as `<style>${invoiceCss()}</style>${invoiceHtml()}` and captured with `host.firstElementChild` — which was the `<style>` tag → 0×0 canvas → blank PDF. Must query `.inv-page` instead. Symptom in console: `element located at 0,0 with size 0x0`.

### 3. Preview = PDF (single source of truth)
- `src/components/Invoice.tsx` — `InvoicePreview` renders `invoiceHtml` + `invoiceCss` via `dangerouslySetInnerHTML` (memoized on `sale`), so preview and export are pixel-identical and immune to dark-theme overrides. Print button calls `printInvoice(sale)`; Download calls the html2canvas→jsPDF path. Keep it this way — do NOT reintroduce a Tailwind copy of the invoice.

### 4. Printing (the blank-page saga — important)
- Original approach: global `@media print` CSS in globals.css using `body * { visibility: hidden }` + un-hiding `.invoice-paper`. **Broke** when the preview class became `.inv-page` (user got fully blank printouts) and it also hijacked `window.print()` on customers/beneficiaries statement pages.
- **Current approach:** `printInvoice(sale)` in invoice-pdf.ts builds a complete standalone document (`printDocument()`: doctype, `@page { size: 148mm 210mm; margin: 0 }`, `print-color-adjust: exact`, `.inv-page tr { break-inside: avoid }`, plus `invoiceCss()`), writes it into a hidden 0×0 iframe (`id="alu-invoice-print-frame"`, via `doc.open()/write()/close()`), waits for images + `document.fonts.ready`, calls `win.print()`, cleans up on `onafterprint` + 120s fallback. The stale global print CSS for invoices was **deleted** from globals.css (a comment marks where it was). Print output is exact A5 — the user's EPSON printer may need paper size set in the dialog.
- Note: `window.print()` blocks the main thread while the dialog is open — in automation this looks like a 10s eval timeout; it's expected behavior.

### 5. Exchange-rate FAB (spinning $ button, every page)
- `src/components/ExchangeRateFab.tsx` — **user explicitly said DO NOT CHANGE this file**. Fixed FAB (bottom-right, mirrored left in RTL, above mobile tab bar) with a spinning gold coin; click opens a Modal with the current rate banner ("1 USD = X IQD") and, for OWNER role only, an edit form calling `PUT /api/settings { exchangeRate }` (server logs changes to ExchangeRateLog; non-owners get 403 — server enforces, FAB just hides the form via `/api/auth/me` role check). Dispatches `alu-rate-change` CustomEvent on save; listens for the same event so Vault-page edits stay in sync. Mounted in **AppShell.tsx** right before the alerts popover.
- Icon: added `dollar` stroke icon to `src/components/icons.tsx` (Lucide-style 24px grid).
- CSS: `.rate-fab`, `.rate-fab-coin`, `rate-coin-spin` (rotateY 3.2s), `rate-fab-pulse` keyframes in globals.css, with reduced-motion, print-hidden, and mobile/RTL variants.
- i18n keys added to `src/lib/i18n.ts`: `currentRate`, `rateLoggedNote`, `rateViewOnly`, `rateSaveFailed` (plus existing `exchangeRate`, `saveRate`, `rateSaved`, `cancel`).

### 6. Language reset bug (last fix)
- **Bug:** every page load, AppShell's persist effect ran with default `lang="en"` *before* the effect reading `localStorage.alu_lang`, overwriting the stored "ku" and PATCHing the server with "en" — Kurdish users kept snapping back to English.
- **Fix in AppShell.tsx:** added `hydrated` state; persist effect (`[lang, hydrated]`) returns early until the saved language is applied. Verified: toggle→ku, reload, still ku/rtl/ckb.

## Verification notes
- Final state verified in the live app (screenshots): invoice preview renders correctly in dark mode (was white-on-white), FAB spins and opens the rate modal (confirmed rate 1,480 IQD), print dialog opens with content, Kurdish persists across reload.
- Watch for: `npm run typecheck` was slow once (150s timeout) — retry with `npx tsc --noEmit` and a longer timeout.
- Preview automation quirk: print dialogs hang the automation browser's main thread; Escape or navigation unsticks it.

## Suggested next steps (user hasn't asked yet)
- Verify "Save PDF" / "Save All (page)" buttons on the invoices list page after the `.page`→`.inv-page` rename (saveInvoicePdf path was fixed but list-page flows only partially re-tested).
- Light-mode invoice visual check; multi-page invoice pagination in PDF/print; printed page numbers for long invoices; a live USD→IQD converter inside the FAB popup.
