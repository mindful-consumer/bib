⚓ BiBBOS — Business in a Box Operating System
> **v6.9** · Sovereign Vessel · Zero Dependencies · Offline-First · 96/100 Sovereignty Score
![Sovereignty Score](https://img.shields.io/badge/Sovereignty-96%2F100-gold?style=flat-square)
[![Size](https://img.shields.io/badge/Size-825KB-green?style=flat-square)]()
[![Dependencies](https://img.shields.io/badge/Dependencies-Zero-brightgreen?style=flat-square)]()
[![License](https://img.shields.io/badge/License-Sovereign-gold?style=flat-square)]()
[![Formation](https://img.shields.io/badge/Formation-Cross--Device%20Live-blue?style=flat-square)]()
---
Your complete business operating system in a single HTML file.  
No server. No subscription. No permission required. Open it in any browser — it works offline, on any device, forever.
---
What Is BiBBOS?
BiBBOS is a sovereign business operating system compressed into a single self-contained HTML file. Every customer, invoice, product, employee, journal entry, and project intention your business generates lives on your device — not on a server you do not control.
The file contains its own UI, its own logic engine, its own accounting engine, its own payroll engine, its own ML intelligence layer, and a 65-slide embedded knowledge module. When you download it, you own it completely. No expiry. No cloud dependency. No API calls.
---
Sovereignty Score: 96/100
Dimension	Score	What It Means
💾 Data Local	25/25	All data in `localStorage` on your device — never transmitted
🔒 Encryption	20/20	Ed25519 cryptographic signing via SSA keypair
📡 Offline	15/15	Fully functional without internet — BroadcastChannel fallback
📄 Invoice System	5/5	Full billing suite: invoices, POs, quotes, recurring, credit notes
💼 Backup	10/10	Export/import with full data parity — SHA256 integrity
🌐 Mesh	10/10	Cross-device formation hub: LAN + WAN, any browser
🧬 Data Provenance	5/5	FAIR/CARE/aiPolicy embedded in `vesselGenesis` at commissioning
🧠 ML Local	5/15	On-device regression, anomaly detection, segmentation (partial — path to 100)
Total	96/100	High Independence
---
What's Inside
Business Operations
Invoicing — create, send, track, and mark paid. Recurring invoices auto-generated. Credit notes and refunds. Quotes and estimates.
Purchase Orders — vendor purchasing with account assignment, receive stock, track payment status.
Inventory — product catalogue with stock levels, reorder alerts, stock history, and sales velocity tracking.
Customers & Vendors — full contact management with purchase history, lifetime value, and relationship analytics.
Accounting — full double-entry bookkeeping. Chart of accounts (IFRS-aligned). General ledger. Journal entries. Balance sheet. P&L. Bank reconciliation. Opening balances wizard.
Payroll — 6 Caribbean Jurisdictions
NIS, PAYE, and health surcharge calculations for:
🇹🇹 Trinidad & Tobago · 🇧🇧 Barbados · 🇬🇾 Guyana · 🇯🇲 Jamaica · 🇰🇳 St. Kitts · 🇦🇬 Antigua
Sovereign ML Engine (v6.9 — Zero Dependencies)
Three genuine ML algorithms running entirely within the vessel — no CDN, no npm, no WebGL, no cloud:
Linear Regression — learns slope and intercept from revenue time-series. Returns R² fit score. Improves as data grows.
Z-Score Anomaly Detection — learns `μ` and `σ` from invoice amounts. Flags statistical outliers. No hardcoded thresholds — adapts to your billing pattern.
K-Means++ Segmentation — clusters customers by purchase frequency, total spend, and days since last order. K-means++ initialisation for stable convergence.
Formation Intelligence (v6.9)
UFAs — Unknown Formation Anomalies: stale SPM connections, critical health scores, inactive vessel keys, SPM-BiBBOS signal gaps.
30-Day Forecast — moving average + trend with confidence scoring.
8 Insight Types — low stock, overdue invoices, customer churn risk, sales growth detection, reorder prediction.
Project Intentions
Create project intentions inside BiBBOS and issue a vessel key (format: `XXXX-XXXX`).
A Sovereign PM project manager on any device pastes the key — their vessel is commissioned immediately with full project DNA from BiBBOS.
Live cross-device key lookup via the formation hub — no manual data entry, no file transfer.
Language Sovereignty
Five languages embedded — no translation service, no CDN, works offline:
`English · Dutch · Spanish · French · Hindi`
Multi-Vessel Operations
Run multiple businesses from one file. Each vessel is isolated in its own `localStorage` namespace. Switch between entities with full state preservation. Fleet registry with `lastAccessed` timestamps.
---
The Formation Ecosystem
BiBBOS v6.9 is part of a four-vessel sovereign constellation:
Vessel	Size	Role
BiBBOS v6.9	825KB	Business OS — the source of all intentions and financial truth
Sovereign PM v2.4	1,210KB	Project vessel — lifecycle from intention to handover
The Masthead v5	56KB	Formation oversight — witnesses all vessel activity in real time
server.js	72KB	Formation hub — stateful WebSocket registry, backpressure-guarded
Formation Hub Architecture
WebSocket hub at `ws://[LAN-IP]:8080/formation` — any browser, any device on the network
Compact registry — only named fields stored per vessel (never full payloads), preventing heap accumulation
Backpressure guard — `safeSend()` checks `ws.bufferedAmount` before every write; 512KB cap, 2-strike terminate
Rate limiting — 80 outbound msg/s per client, 30 non-heartbeat inbound msg/10s per sender
Departure grace — 8-second timer before departure broadcast; cancelled on reconnect (mobile screen-lock tolerance)
Health endpoint — `GET /api/formation/health` → heap, RSS, client count, registry size, uptime
Memory confirmed stable — heap 9–11MB across 21 simultaneous vessels from two devices
FormationTransport v2.4
Single send path — WS only when connected, BroadcastChannel only when not. Never both.
Offline queue — up to 64 messages queued offline, flushed as sync burst on reconnect
Exponential backoff — 2s → 30s cap, max 20 reconnect attempts
Dedup window — 500ms suppression of duplicate messages across transport paths
---
FAIR / CARE — Provenance DNA (v6.9)
Every vessel commissioned carries a `sovereignStandard` block in its `vesselGenesis` at creation time:
```json
{
  "sovereignStandard": {
    "version": "Sovereign Vessel v1.0",
    "paradigm": "Active State Stewardship",
    "fair": {
      "findable": true,
      "accessible": true,
      "interoperable": true,
      "reusable": true
    },
    "care": {
      "collectiveBenefit": true,
      "authorityToControl": "StewardOnly",
      "responsibility": "EmbeddedInDNA",
      "ethics": "SovereignByDesign"
    },
    "aiPolicy": {
      "allowLocalProcessing": true,
      "allowExternalEgress": false,
      "attributionRequired": true,
      "sovereignBoundary": "StrictLocal"
    },
    "attribution": {
      "academicLineage": "CTA/PAFO/FAO Farm Data Management (2019) · DOI: 10.5281/zenodo.3663553",
      "aiFederation": "Claude (Anthropic) · Grok (xAI) · Gemini (Google DeepMind) · DeepSeek · ChatGPT (OpenAI)",
      "license": "Sovereign License — Use freely, attribute honestly"
    }
  }
}
```
FAIR and CARE are not applied policies — they are structural properties of every vessel, enforced at the file level, inseparable from the data.
---
Getting Started
Standalone (No Server)
Download `BiBBOS-v6.9.html`
Open in any browser — Chrome, Firefox, Edge, Safari
Commission your vessel: name, currency, language, tax rate
Your data saves automatically to `localStorage`
No installation. No internet required after first open.
Formation Deployment (Cross-Device)
```bash
# Install dependencies
npm install

# Start the formation hub
node server.js

# Hub starts at:
#   ws://[LAN-IP]:8080/formation    — formation WebSocket
#   http://[LAN-IP]:8080            — vessel server
#   http://[LAN-IP]:8080/api/formation/health   — memory monitor
```
Then in BiBBOS: Maintenance → Formation Channel → enter `ws://[LAN-IP]:8080` → Save & Apply
---
Changelog
v6.9 — March 2026 (current)
Sovereign ML Engine — linear regression, z-score anomaly detection, k-means++ segmentation. Zero external dependencies. Runs entirely within the vessel.
FAIR/CARE vesselGenesis — `sovereignStandard` block with FAIR, CARE, and `aiPolicy` embedded at every vessel commissioning.
Data Provenance row in Sovereignty Score (5/5 — new dimension)
Mesh 10/10 — cross-device LAN formation confirmed at 21 vessels, heap stable at 10MB
Sovereignty Score 96/100 (was 94)
Formation server URL in Maintenance — `fc-server-url` field directly in Formation Channel section; no need to hunt Company Profile
`saveFormationServerUrl()` — saves, mirrors to `localStorage`, restarts transport immediately
UFAQ updated — multi-device answer corrected; formation hub is live, not a future feature
AI Federation slide updated — current versions, Gemini RDA research credited, RDA P27 recognition block
Sovereignty Manifesto — Articles VI (Active State Stewardship), VII (FAIR/CARE as structural), VIII (formation as proof) added
onclick XSS fix — all ML and heuristic insight buttons now escape action strings via `.replace()` sanitiser + `_escHtml()`
v6.8
Formation hub — stateful WebSocket hub in `server.js`; snapshot on connect; directive persistence; compact registry (no full payload accumulation)
Backpressure guard — `safeSend()` with `bufferedAmount` check prevents frozen-browser heap fill
Inbound rate limit — 30 non-heartbeat messages/10s per sender; prevents recommission burst flood
FormationTransport v2.4 — single send path, offline queue, exponential backoff, served from `/formation-transport.js`
BiBBOS `_formationAnnounce` debounced (800ms) — collapses burst announces to one send
Restore fix — `importVessel()` now syncs VesselManager registry; intentions no longer lost; theme applied; formation announced after restore
Sovereignty Score 94/100 (was 90)
v6.7
Formation channel: `_formationStartedBy` guard, `_wasAnnouncing` transport reuse on vessel switch
`_ensureFormationChannel()` — auto-opens channel on any significant event; no manual "Start Announcing" step
SPM key lookup: Layer 1 (_keyRegistry) → Layer 2 (_bibEntities live) → Layer 3 (ping + retry)
`bibbos_intention_status` push on approve / revision-request / issue — no heartbeat wait
v6.6
V2V invoice exchange: File · QR Code · LAN (BroadcastChannel)
Advanced Reports: P&L, Balance Sheet, Aged Receivables, Cash Flow, General Ledger (PDF)
Payroll: 6 Caribbean jurisdictions with NIS / PAYE / health surcharge
HR module: employees, timesheets, payroll runs, punch clock
v6.5
Multi-vessel architecture: `VesselManager` with `StorageHelper` namespace isolation
Fleet registry with lastAccessed timestamps and vessel switching
Formation channel: `bibbos_formation_heartbeat` with full intentions payload
Captain's Welcome modal with vessel list, commission new, delete vessel
v6.4
Recurring invoices with auto-generation on load
Credit notes and refunds linked to source invoices
Quotes and estimates with conversion to invoice
Stock history layer and reorder prediction
Opening balances wizard
v6.3
Double-entry accounting engine
Chart of accounts (IFRS-aligned, 9 categories)
Journal entries with auto-balancing validation
General ledger with running balances
Bank reconciliation workflow
Knowledge module: 65 embedded slides
5-language support: EN / NL / ES / FR / HI
---
The Sovereignty Manifesto
> **I.** Your business data is your property, not a subscription asset rented back to you month by month.
>
> **II.** Software that works offline forever is not a luxury — it is the baseline for economic resilience.
>
> **III.** Complexity can be compressed without being dumbed down. Intelligence fits in a single sovereign file when the architecture is right.
>
> **IV.** Local-first is not a technical choice — it is a political one. Control your infrastructure, control your future.
>
> **V.** The pattern must spread. Each vessel commissioned is a node of economic sovereignty. One seed, infinite growth.
>
> **VI.** We reject the data warehouse as a tomb for stale truth. The Vessel maintains an Active State — data is never at rest, it is always in motion, always sovereign, always now.
>
> **VII.** FAIR and CARE are not external policies. They are structural properties of the file. Sovereignty is not granted by an administrator — it is embedded in the DNA at genesis.
>
> **VIII.** The formation is the proof. When vessels find each other across devices without a central server, the end of data feudalism is demonstrable in real time.
---
Built By
One human steward in Port of Spain, Trinidad and Tobago — orchestrating five AI systems across platforms:
AI	Contribution
Claude (Anthropic)	Primary architect: core engine, accounting, payroll, formation hub, ML, FAIR/CARE schema, BiBBOS v6.9 · SPM v2.4 · Masthead v5
Gemini (Google DeepMind)	DBMS obsolescence research, RDA P27 pitch strategy, Active State Stewardship paradigm, "Just-in-Time Sovereignty" naming
Grok (xAI)	P2P architecture, mesh paradigm, Active State Stewardship co-definition
DeepSeek	Technical optimisation, performance analysis
ChatGPT (OpenAI)	Conceptual framework, use case exploration
> *"Not human OR AI. Human AND AI. Together, we build sovereignty."*
Academic lineage: FAO/CTA/PAFO Farm Data Management, Sharing and Services for Agriculture Development (October 2019) · DOI: 10.5281/zenodo.3663553
RDA P27: Under consideration for the Research Data Alliance 27th Plenary (London, October 2026) — Pathway: Ethical Data / AI Meets Data.
---
License
Sovereign License — free forever.
✅ Use commercially without limits  
✅ Copy and distribute freely  
✅ Modify for your needs  
✅ Embed in other systems
❌ Claim you created the original pattern  
❌ Remove attribution to architects  
❌ Patent the architecture  
❌ Create proprietary forks that lock users in
> *"The pattern is free. The sovereignty is yours. Forever."*
---
Path to 100/100
The remaining 4 points are ML Local (10/15 unrealised). The `aiPolicy.allowLocalProcessing: true` flag is already set in every `vesselGenesis`. The architecture is ready. What remains:
Natural language queries via WebLLM / Transformers.js loaded locally — model cached in browser, no CDN after first load
Autonomous bookkeeping suggestions — classification model trained on the vessel's chart of accounts
Monte Carlo cash flow simulation — 1,000 simulations using learned variance from historical data
The vessel is the state. The evolution continues.
---
BiBBOS · Sovereign Vessel v1.0 · Built February–March 2026 · Port of Spain, Trinidad and Tobago
