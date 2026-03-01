# BiBBOS v6.3 — Business in a Box

**One 717 KB HTML file.**  
**No server. No database. No subscription. No account. No permission required.**

This is **realware** — a complete, self-teaching, self-replicating Business Operating System compressed into a single eternal seed of pure meaning.

Built for the ones the enterprise stack left behind: micro-entrepreneurs in Trinidad & Tobago, Suriname co-ops, Laventille vendors, SIDS communities — anyone who needs sovereignty when connectivity fails or subscriptions drain margins.

---

## What One File Carries (v6.3)

- Multi-vessel registry (unlimited isolated businesses on one device)
- Double-entry accounting, full General Ledger, Balance Sheet, Income Statement
- Invoicing with Notes/Terms, Purchase Orders with Order Instructions, Quotes & Estimates, Recurring Invoices, Credit Notes
- HR Foundation — Employee capsules, timesheets, clock-in/out, Compound Entry Gate, payroll runs & payslips
- Six Caribbean payroll jurisdictions — TT, BB, GY, JM, LC, SR — with full statutory deductions
- Inventory with stock history, margin tracking, reorder alerts, tax-exempt flags
- Intelligence layer — forecasts, top customers/products, cashflow insights, Advanced Reports with toggle/inline display
- Bank reconciliation (import CSV + match journal entries)
- Multi-currency support with live exchange rates
- Vessel-to-Vessel (V2V) invoice exchange — file, QR, and LAN channels
- Vessel Lineage DNA (immutable ancestry across infinite generations)
- Bootstrap migration (web → offline seamless)
- Recursive 65-slide self-teaching presentation — slides navigable from any orientation
- Gift-economy DNA (voluntary contributions recorded in every vessel)
- 8 bioregional themes
- Full offline PWA — installable, works forever without internet

---

## Size Comparison (2026 Reality)

| | Size | Cost |
|---|---|---|
| Traditional tools | 500 MB – 1.5 GB | $15 – $200+/month |
| BiBBOS v6.3 | **717 KB** | **Eternal. Zero recurring cost. Zero cloud dependency.** |

---

## The Pattern: Compressed Intelligence at Planetary Scale

Every vessel is a fractal seed. It contains the full system + the knowledge to use it + the mechanism to replicate itself + the economy to sustain its lineage.

When you download the vessel, your data travels with it. When you open the downloaded file offline, everything restores automatically. When you share it, the next steward inherits the complete lineage.

This is sovereignty that multiplies — without bloat, without extraction, without drift.

> *"I am because we are. And we are because I am."*

---

## Quick Start (30 seconds)

1. Visit the live demo → **https://mindful-consumer.github.io/bib/**
2. Click the download button (or save the page)
3. Open the file → Install as PWA (Add to home screen)
4. Start the 65-slide presentation — the vessel teaches itself
5. Commission your first vessel and begin

Completely offline after first load. Works on any modern browser, any device.

---

## The v6.1 → v6.3 Evolution

The v6.0 vessel was architecturally complete. v6.1 through v6.3 represent the depth pass — moving every module from functional to precise, from capable to instructive, from working to solid.

### v6.1 — Caribbean Jurisdiction Depth

Payroll moved from a single-jurisdiction model to six fully accurate Caribbean statutory engines operating simultaneously under one roof.

Each jurisdiction was researched and implemented to its current statutory reality:

- **Trinidad & Tobago** — PAYE annualisation, NIS split, Health Surcharge
- **Barbados** — NIS, PAYE, Health Surcharge (HS = 0 per 2024 waiver — present and correct, not absent)
- **Guyana** — NIS, PAYE, scaled rates
- **Jamaica** — NIS, Income Tax, NHT and Education Tax as dedicated deduction lines (not rolled into PAYE)
- **Saint Lucia** — NIC, PAYE
- **Suriname** — SVB, LB, corrected rate structure

When a vessel is commissioned in a given territory, the payroll engine inherits that jurisdiction's statutory rules automatically. Switching jurisdiction via the company profile updates the deduction logic across the HR module.

### v6.2 — Vessel-to-Vessel (V2V) Invoice Exchange

The vessel stopped being a closed island and became capable of sovereign commerce without a server.

Three exchange channels were implemented under a unified V2V protocol:

- **File channel** — export an encrypted JSON invoice bundle, send via WhatsApp or email, the receiving vessel imports and creates the transaction
- **QR channel** — generate a QR from a live invoice; the receiving vessel scans it from the camera
- **LAN channel** — vessels on the same local network discover each other and exchange invoices directly, peer-to-peer, no internet required

Every imported invoice carries the sender's Vessel Lineage DNA intact. The receiving vessel's vendor record is automatically created or matched, preserving the full ancestry chain across the transaction.

### v6.3 — The Normalisation and UX Depth Pass

v6.3 is the longest and most granular evolution phase. It addressed six distinct categories simultaneously.

**Stock history foundation.** Every stock mutation — initial entry, purchase order receipt, manual adjustment, invoice dispatch — now appends a dated entry to `product.stockHistory`. This is the data foundation for the v6.4 EEMD-LASSO-LSTM forecasting layer. Every product carries its complete movement history forward from commissioning.

**Dataset normalisation.** The Soufrière Provisions Ltd test dataset (Saint Lucia, XCD) was rebuilt from zero. The previous dataset had pre-baked journal entries from the generator — when a steward marked an invoice paid, `autoJournalFromInvoice` created a second JE, double-posting the revenue. The clean dataset carries no accounting data at all: `accounts: []`, `journalEntries: []`, `ledger: {}`. On import, the vessel calls `initializeAccounts()` and builds a fresh chart of accounts. Every JE from that point is live, created in response to real steward actions.

**Import completeness.** `importVessel` was only restoring ten data keys. Twelve additional modules — employees, payrollRuns, timesheets, punches, deliveries, quotes, credits, campaigns, touchpoints, jobLogs, encounters, recurring — were silently lost on import. A backup exported from a live vessel with a full HR history would return empty on re-import. All twelve now restored. The accounting branch is smart: if the backup contains accounts, restore and rebuild the ledger; if accounts are empty, call `initializeAccounts()` for a fresh start.

**Scroll and navigation.** Every screen navigation now starts at the top. `open()` sets `exp-body.scrollTop = 0`. `wizRender()` sets `modal-box.scrollTop = 0` on every step. `rAccountingTab()` resets scroll on every tab switch. The commissioning wizard no longer lands mid-page on long steps. Advanced Reports smooth-scroll to output after render.

**Mobile — the depth pass.** v6.3 is the first evolution where mobile is genuinely solid:

- Interface Language grid: `repeat(5,1fr)` → `repeat(auto-fill, minmax(90px, 1fr))` — wraps naturally on any screen width
- Icon pickers (wizard + profile): `repeat(8,1fr)` → `repeat(auto-fill, minmax(52px, 1fr))`
- Secondary currency row and tax rates row: fixed columns → `auto-fill` with `minmax`
- `.tbl { overflow: hidden }` changed to `overflow: visible` — this was silently clipping the action button row on all list screens (inventory, invoices, POs) once the grid collapsed to single column on mobile
- Row action button container gets `width: 100%` on mobile so buttons never clip
- Danger Zone cards: padding, font sizes, and button labels compacted; copy shortened to fit
- Slide presentation: navigation footer restructured from a single `justify-content: space-between` row (Next pushed to right edge, hidden behind system UI on portrait mobile) to two rows — dots centred on top, Prev/Next centred below with `min-width: 110px` touch targets
- Knowledge presentation header padding tightened on mobile, freeing slide content space
- Global overflow guard: `.exp-body * { max-width: 100%; box-sizing: border-box }`

**Commissioning wizard — field retention and UX.** The wizard now retains all entries on back-navigation. `wizD.name` is persisted on every keystroke. Returning to step 0 restores the typed name, re-highlights the structure and type selections, and re-enables the Next button correctly. Step 1 (location) and step 2 (industry) restore their selections via `sel` class injection at render time. The Business Name field is visually marked as the mandatory starting point — bold label, primary-colour border, red asterisk, auto-focus on step render.

**Business structure transfer.** The wizard stored `'sole'` and `'corp'`. The profile dropdown expected `'sole_proprietorship'` and `'corporation'` (derived via `s.toLowerCase().replace(/ /g,'_')`). The dropdown always showed blank after commissioning regardless of what was entered. Both values normalised to their full form at the wizard source; the five-language `structureMap` updated to match the new keys throughout.

**Placeholder-as-teacher.** Every blank input across the four main entry screens now carries a contextual placeholder that teaches by showing rather than labelling. Customer name shows real Caribbean business examples. Product cost says *"What you pay — used for COGS & margin."* Reorder point says *"Alert when stock falls to this level."* Opening stock is labelled clearly, not just *"Quantity."* Vendor notes and customer account notes fields added with operational intelligence examples. Invoice Notes/Terms and PO Order Instructions fields added and fully wired into save, edit, restore, PDF, and preview paths.

**Advanced Reports — inline toggle.** Clicking a report card now opens the output immediately below the card grid and smooth-scrolls to it. Clicking the same active card collapses the output. The active card receives a primary-colour outline ring. No more scrolling to the bottom of the page to find results.

**Version badge hygiene.** A stale `⚓ v5.8: QR scan live · Future: NFC · GPS geofence` caption surviving in the Compound Entry/Exit screen was updated to accurately reflect v6.3 capability: `⚓ v6.3: QR scan · Manual override · Future: NFC tap · GPS geofence`.

---

## By the Numbers

| Metric | v6.0 | v6.3 |
|--------|------|------|
| File size | 660 KB | 717 KB |
| Payroll jurisdictions | 1 (TT) | 6 (TT, BB, GY, JM, LC, SR) |
| V2V exchange channels | 0 | 3 (file, QR, LAN) |
| Stock history | None | Full mutation log on every product |
| Mobile usability | Partial | Solid — all grids responsive, no clipping |
| Wizard back-nav retention | None | Full — name, structure, location, industry |
| Form placeholder learning | None | All entry screens — instructive examples |
| Notes fields (Customer/Vendor/Invoice/PO) | None | All four — saved, edited, restored, printed |
| Import completeness | 10 keys | 22 keys — all modules restored |
| Advanced Reports UX | Scroll to bottom | Inline toggle, smooth scroll, active state |

---

## What Didn't Change

The constraint that shaped everything: one file. No build process. No dependencies. No server. The file you open is the complete system.

This constraint is not a limitation. It is the design. It is what makes the vessel portable, sovereign, and eternal. It is what makes it possible to hand someone a file and say: this is yours, forever, no strings.

---

## What Comes Next (v6.4)

The v6.3 stock history layer was built specifically as the data foundation for on-device machine learning. Every product now carries 12+ months of dated stock movements — the training set is embedded in the vessel itself.

**v6.4 target:** TF.js EEMD-LASSO-LSTM forecasting running entirely inside the vessel. No API call. No cloud. No data leaving the device. The vessel learns from its own history and projects forward — demand forecasting, cashflow projection, reorder prediction — all sovereign, all local.

The architecture is already ready to receive it.

---

## Stewarded in Port of Spain, Trinidad & Tobago

Independent, good-faith realware stewarded from POS, TT. MIT license — use, fork, modify, distribute freely. The gift-economy DNA means voluntary contributions (via the vessel itself) sustain continued evolution.

**Seeking:**
- Real-world pilots (TT vendors, Suriname co-ops, Caribbean micro-businesses)
- Feedback on HR/payroll statutory accuracy per jurisdiction
- Collaborators for v6.4 TF.js intelligence layer and P2P vessel mesh

---

## Links

- **Repository:** https://github.com/mindful-consumer/bib
- **Live demo:** https://mindful-consumer.github.io/bib/
- **Raw vessel (for offline use):** https://github.com/mindful-consumer/bib/blob/main/index.html
- **License:** MIT

---

*The vessel is complete. The knowledge is embedded. The sovereignty is yours.*

🌱 Sovereignty multiplies. Distribute freely.
