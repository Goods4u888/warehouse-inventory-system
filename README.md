# Warehouse Inventory — v2

QR-code receiving and requisition for a construction-materials warehouse.
Built to match `functional_spec` (SKU/lot/QR receiving, scan-to-issue with
discrepancy handling, thresholds, reporting) and the companion
[Warehouse Stock Flow](workflow diagram) mechanism: two entry paths writing
into one stock ledger.

This is a plain HTML/CSS/JS app talking directly to Supabase (Postgres +
auto-generated API). No build step — open `index.html` and it runs.
Bilingual (Thai/English, switch top-right), responsive from phone through
tablet.

**Three pages, two audiences.** `index.html` is a small landing page with two
buttons: **Request form** (public, no login — anyone with the link can submit
a request and get a reference number) and **Admin** (`admin.html` — Stock,
Receive, Scan, Requests, Reports; requires staff login). Row Level Security
in the database enforces this split for real, not just in the UI — see
"Public form vs. admin login" below.

## Setup (one time)

1. **Run the schema.** Open your Supabase project → SQL Editor → New query,
   paste the contents of `supabase/schema.sql`, and run it. This creates the
   tables, the atomic RPCs (`receive_stock`, `return_stock`, `issue_stock`,
   `create_sku`, `create_public_request`), the report views, the Row Level Security
   policies that split public vs. admin access (see "Public form vs. admin
   login" below), and seeds five sample construction-material SKUs plus the
   ten starting categories so the app has something real to show
   immediately. The file is safe to re-run against a database that already
   has data — every statement is idempotent (tested against a real Postgres
   instance, including a second full re-run against populated tables). If
   you ran an earlier version of this schema, re-running the current file
   picks up everything added since — lot numbering, `picked_up_by`,
   categories, system-generated SKU codes, and the public/admin RLS split —
   without losing anything.
2. **(Optional) Load the demo catalog.** `supabase/seed_mockup_100.sql` adds
   ~100 more realistic Thai-named items — construction materials plus
   hotel-facilities stock (electrical, sanitary ware, paint, lumber, cleaning
   supplies) — across ten categories, so Stock/search/reports have enough
   variety to demo properly. Run it in the SQL Editor the same way, any time
   after `schema.sql`; its `sku_code`s (CMT-/STL-/AGG-/PVC-/HDW-/ELE-/SAN-/
   PNT-/LUM-/CLN-) are chosen to never collide with `schema.sql`'s own 5-item
   seed, and re-running it is a no-op. Delete rows you don't want from the
   Supabase table editor, or skip this file entirely for a clean start — it's
   optional. (Regenerate or edit the list from `scripts/gen_mockup_seed.py`.)
3. **Create the shared admin login, once.** Admin access is real Supabase
   Auth under the hood, but the app only ever asks staff for a password — the
   email is a fixed, non-mailbox identifier the app already knows
   (`admin@warehouse.local`), not something anyone types in. In your Supabase
   project: **Authentication → Users → Add user**, email
   `admin@warehouse.local`, pick a password, and toggle **Auto Confirm User**
   on (so it doesn't wait on a confirmation email that will never arrive).
   Share that password with whoever should reach `admin.html`; anyone without
   it only ever sees the login screen, and the database itself (not just the
   UI) refuses every admin query without it — see "Public form vs. admin
   login" below. Change the password any time from that same Users screen.
4. **Credentials are already wired up** in `js/config.js` (your project URL
   and anon/publishable key). If you ever rotate the anon key, update it
   there — never put the `service_role` key in this file, it bypasses Row
   Level Security entirely and this file ships to every browser that loads
   the app.
5. **Open the app.** Double-clicking `index.html` works for a first look, but
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
   URL in most browsers. `index.html` is the landing page; share
   `request.html` directly if you want a link that skips straight to the
   request form (e.g. on a poster or an intranet page).

## What's in v2

- **Landing page** (`index.html`) — two doors, Request form and Admin.
  Nothing else lives here; it doesn't talk to the database at all. It's a
  hub screen built from the same component library as the rest of the app
  (header, eyebrow, chip, card) rather than a separate marketing page, so it
  reads as one more screen in the system, not a different site: an icon
  tile per door, each badged with whether it needs a login before you click
  it.
- **Public request form** (`request.html`) — no login. Name, department, and
  a required **area/job** line (what the materials are actually for, e.g.
  "Building A, 3rd floor restroom") — modeled on the paper requisition slip
  this replaces, which always has that line filled in. Then search the same
  item catalog Stock/Receive use and add any number of items to a list (each
  gets its own quantity), a free-text comment, or both — the form only
  insists on at least one of items-or-comment (the area/job line is always
  required, separately). Submitting hands back one request number
  (`REQ-YYMMDD-NNN`, assigned atomically by the database, same pattern as lot
  and SKU codes) shared by every item in the list. The confirmation screen
  has a **Print / Save as PDF** button; what actually prints is a dedicated,
  print-only layout (invisible on screen — the on-screen confirmation stays a
  simple digital summary) built to match that same paper slip: a letterhead
  (the office's logo — `img/logo-property-office.png` — and its name,
  "สำนักงานบริหารทรัพย์สินและกีฬา มหาวิทยาลัยธรรมศาสตร์", top-left of the
  page), a header with the request number, a table of
  date/department/name/area-job, a numbered
  item table (comment-only requests print the comment as the single line
  item; a comment alongside a real item list prints as a separate notes line
  so it isn't lost), and 4 blank signature boxes — **ผู้ขอเบิก** (requester),
  **ผู้ตรวจสอบ (หัวหน้า)** (supervisor), **ผู้จ่ายวัสดุ/อุปกรณ์** (issued
  by), **ผู้รับวัสดุ/อุปกรณ์** (received by) — for the physical sign-off
  chain once it's printed. A requester can keep a copy without needing to be
  logged in to anything. These land in the same `requests` table and the
  same admin Requests tab/Reports as the item-based requests staff create
  internally — one pipeline, and the area/job line and a search on it show
  there too. Under the hood a multi-item submission is stored as one row per
  item (all sharing the same `request_code`), so the admin Requests
  list/Reports show one card per item rather than grouping a multi-item
  request under a single card — a deliberate tradeoff to avoid touching the
  Scan/Issue matching logic, which already works sku-by-sku. The item search
  only ever shows active items (never deactivated ones), via a narrow
  read-only RLS policy — see "Public form vs. admin login" below.
- **Admin login** (`admin.html`) — a single shared password gates the whole
  admin app (Stock, Receive, Scan, Requests, Reports). It's real Supabase
  Auth underneath (see Setup step 3), so this isn't just a UI curtain: Row
  Level Security refuses admin data to anyone who hasn't signed in, at the
  database level.
- **Stock** — current on-hand quantity per SKU (summed across all lots),
  filterable by category and searchable by SKU code or name, with a
  low-stock flag driven by each SKU's threshold. A "Manage items" button
  opens full CRUD on the item master:
  add a SKU, edit any field, deactivate (soft-delete — history is kept) or
  reactivate one. Deactivated items drop out of Receive and New Request
  pickers but stay visible, separately listed, in Manage items.
- **Receive / Return** — a segmented toggle at the top of this tab switches
  between the two. Receive logs a new batch (item, quantity, unit, supplier
  ref); Return logs materials coming back into stock (item, quantity, an
  optional freeform note, who's returning it) — freeform on purpose, not
  tied to a specific original request, since a site return in practice often
  isn't cleanly one pickup's worth. Both generate a lot ID and a QR sticker
  you can print directly from the browser (the QR encodes the lot ID only —
  never quantity, since a printed sticker can't be updated later); a
  returned lot is a brand-new lot rather than being folded back into
  whichever lot it originally came from, so every other lot's receive date
  stays meaningful, and it's fully scannable/issuable again just like any
  other batch — Scan/Issue shows a "Returned" badge on it so staff can tell
  at a glance. Lot IDs read as `SKU-YYMMDD-NNN` (e.g. `CEM-001-260906-001`),
  a running count per SKU per day shared by both Receive and Return, so the
  code on the sticker tells you at a glance what it is and roughly when it
  came in — generated by an atomic Postgres upsert, so two staff logging the
  same item at once still get distinct, gap-free numbers.
- **Scan** — camera-based QR scanning (falls back to typing the lot code)
  to look up a lot, pick which open request it fulfills, confirm the actual
  quantity, and deduct stock. A mismatch between requested and actual
  quantity still deducts stock but logs a discrepancy rather than silently
  accepting it or blocking the transaction — see the Discrepancies report.
  Whoever is picking the order up types their name here; it's recorded as
  the request's `picked_up_by`.
- **Requests** — submit an item-based request internally (who's asking, what,
  how much, needed by) or receive one through the public form, and move
  either kind through pending → preparing → ready → fulfilled. A fulfilled
  item request shows both who asked for it (`requester_name`) and who
  actually picked it up (`picked_up_by`, captured at the Scan step) — they're
  often different people, and now the system keeps both. Searchable by
  requester, department, picker, item, request number, or date (either
  `2026-09-06` or however your browser formats it) — this doubles as how
  admin looks up a request someone quotes over the phone.
- **Reports** — Stock, Movement history, Requests (who requested what, from
  which department, when, and its status — the public form's comment shows
  here too), Discrepancies, Low stock — each searchable across its columns
  (SKU, name, lot code, who performed it, requester, date, etc).
- **Thai / English** — every screen switches with the toggle next to Refresh
  (top right); the choice is remembered per browser. Thai is the default
  language, since day-to-day warehouse staff are the primary users.
- **Phone, tablet, and wider** — one responsive layout throughout: a single
  column on a phone, and from tablet width up the stock/requests/manage-items
  lists switch to a 2- or 3-column grid so the extra width isn't wasted.
- **Icons throughout** — every action button, the report and request-status
  tabs, and each material category chip carries a small hand-drawn line icon,
  in the same no-fill/currentColor style as the bottom tab bar. All inline
  SVG defined in `js/icons.js` — no icon font, no external request.
- **Ten material categories**, each with its own colour + icon: Cement,
  Steel, Aggregate, Pipe & Fittings, Hardware, Electrical, Sanitary Ware,
  Paint, Lumber, and Cleaning Supplies — the last five added to cover
  hotel-facilities stock alongside pure construction materials. New
  categories fall back to a generic grey "Other" chip automatically.

## Scope decisions worth knowing about

- **Public form vs. admin login.** `request.html` is meant to be reachable by
  anyone with the link, with no login — so the database, not just the app,
  treats it that way. The anon key (visible to anyone, since it ships in
  `js/config.js` to every browser) can do exactly two things: read active
  rows from `skus` (so the request form's item search works — deactivated
  items stay invisible to it), and insert a new row into `requests`, only
  through the `create_public_request()` function, which only accepts a
  name/department/comment/item/quantity — it can't read, edit, or delete
  anything, including the row it just created. Every other table, and every
  other operation on `skus`/`requests` (editing the catalog, search, status
  changes, fulfillment), requires the "authenticated" role, which only
  exists after `Auth.signIn()` succeeds against the one shared admin account
  (Setup step 3). "Picked up by" / "requester name" stay free-text fields
  rather than per-person identities even for logged-in staff — so within the
  admin side, they're still a record of what someone typed, not a
  cryptographic guarantee of who did what. Moving to per-staff accounts
  (Requester / Staff / Admin roles, matching the spec's User entity) is a
  further policy change, not a redesign — the shared-login groundwork is
  already in place.
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
index.html                     landing page — Request form / Admin, nothing else
admin.html                     the admin app shell (5 tabs + a bottom sheet for forms) behind login
request.html                   the public request form + printable confirmation
css/tokens.css                 design tokens — colour, type, spacing (nothing raw in app.css)
css/app.css                    every component, shared by all three pages (one visual language)
js/config.js                   Supabase URL + anon key
js/db.js                       every Supabase call the app makes, incl. Auth.signIn/signOut
js/qr.js                       QR generation (sticker) + camera scanning
js/i18n.js                     Thai/English dictionary, t() lookup, language switching
js/icons.js                    shared inline-SVG icon set (icon(name), catIcon(category))
js/app.js                      admin.html's view router, auth gate, and UI wiring
js/request.js                  request.html's own small, standalone script
supabase/schema.sql            tables, views, RPCs, RLS policies, 5-item seed
supabase/seed_mockup_100.sql   optional ~100-item Thai demo catalog (see Setup step 2)
scripts/gen_mockup_seed.py     regenerates seed_mockup_100.sql from an editable Python list
```
