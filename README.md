# Warehouse Inventory — v1

QR-code receiving and requisition for a construction-materials warehouse.
Built to match `functional_spec` (SKU/lot/QR receiving, scan-to-issue with
discrepancy handling, thresholds, reporting) and the companion
[Warehouse Stock Flow](workflow diagram) mechanism: two entry paths writing
into one stock ledger.

This is a plain HTML/CSS/JS app talking directly to Supabase (Postgres +
auto-generated API). No build step — open `index.html` and it runs.

## Setup (one time)

1. **Run the schema.** Open your Supabase project → SQL Editor → New query,
   paste the contents of `supabase/schema.sql`, and run it. This creates the
   tables, the two atomic RPCs (`receive_stock`, `issue_stock`), the report
   views, and seeds five sample construction-material SKUs so the app has
   something real to show immediately.
2. **Credentials are already wired up** in `js/config.js` (your project URL
   and anon/publishable key). If you ever rotate the anon key, update it
   there — never put the `service_role` key in this file, it bypasses Row
   Level Security entirely and this file ships to every browser that loads
   the app.
3. **Open the app.** Double-clicking `index.html` works for a first look, but
   the camera scanner needs a "secure context" (HTTPS or `localhost`), so for
   real use serve it locally instead:
   ```
   npx serve .
   ```
   or
   ```
   python -m http.server 8080
   ```
   then open `http://localhost:8080` (or `http://localhost:5000` for
   `serve`) — camera access will work there but not from a plain `file://`
   URL in most browsers.

## What's in v1

- **Stock** — current on-hand quantity per SKU (summed across all lots),
  filterable by category, with a low-stock flag driven by each SKU's
  threshold.
- **Receive** — log a new batch (item, quantity, unit, supplier ref),
  generates a lot ID and a QR sticker you can print directly from the
  browser (the QR encodes the lot ID only — never quantity, since a printed
  sticker can't be updated later).
- **Scan** — camera-based QR scanning (falls back to typing the lot code)
  to look up a lot, pick which open request it fulfills, confirm the actual
  quantity, and deduct stock. A mismatch between requested and actual
  quantity still deducts stock but logs a discrepancy rather than silently
  accepting it or blocking the transaction — see the Discrepancies report.
- **Requests** — submit a request, and move it through
  pending → preparing → ready → fulfilled.
- **Reports** — Stock, Movement history, Discrepancies, Low stock.

## Scope decisions worth knowing about

- **No login yet.** Every screen is open to anyone with the link, and
  "performed by" / "requester name" are free-text fields rather than
  authenticated identities. Row Level Security is enabled in the schema but
  the policies currently grant the anon key full access. Before more people
  than your own staff can reach this, or before it's reachable from the open
  internet, the natural next step is Supabase Auth with role-scoped policies
  (Requester / Staff / Admin, matching the spec's User entity) — the schema
  is already shaped to make that a policy change rather than a redesign.
- **No SKU editing UI yet.** New SKUs need a row inserted in the `skus`
  table directly (via the Supabase table editor) — the Receive screen only
  picks from existing active SKUs. A "manage SKUs" screen (create, edit,
  deactivate, set thresholds) is the obvious next screen to add.
- **Unit conversion is stored, not yet enforced in the UI.** `alt_uom` and
  `conversion_factor` exist on each SKU, but Receive and Issue currently work
  in the SKU's base unit only. Wiring the conversion into the receive form
  (so staff can log "2 pallets" and have it convert to 100 bags) is a good
  v1.1 addition.
- **Stock deduction is transactional** via a Postgres function that locks
  the lot row (`for update`) before deducting, so two staff scanning the
  same lot at once can't both succeed against a balance that's no longer
  there.

## Files

```
index.html          the whole app shell (5 tabs + a bottom sheet for forms)
css/tokens.css       design tokens — colour, type, spacing (nothing raw in app.css)
css/app.css          components
js/config.js         Supabase URL + anon key
js/db.js             every Supabase call the app makes
js/qr.js             QR generation (sticker) + camera scanning
js/app.js            view router and UI wiring
supabase/schema.sql  tables, views, RPCs, RLS policies, seed data
```
