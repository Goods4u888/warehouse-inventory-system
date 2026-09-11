# Warehouse Inventory — v2

QR-code receiving and requisition for a construction-materials warehouse.
Built to match `functional_spec` (SKU/QR receiving, scan-to-issue with
discrepancy handling, thresholds, reporting) and the companion
[Warehouse Stock Flow](workflow diagram) mechanism: two entry paths — Receive/
Return and Scan (Issue / Receive more) — writing into one running total per
item. (Through 2026-09-07 that shared ledger was a sum across per-delivery
lot balances, each with its own QR sticker; as of 2026-09-08 it's a single
`qty_on_hand` per item under one permanent sticker — see "One QR per item,
not per batch" below.)

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
   instance: a fresh install, a second full re-run against populated tables,
   and — for the 2026-09-08 lots→items migration specifically — applying the
   new file on top of a database still running the old lot-based schema with
   real historical data). If you ran an earlier version of this schema,
   re-running the current file picks up everything added since —
   `picked_up_by`, categories, system-generated SKU codes, the public/admin
   RLS split, and (as of 2026-09-08) the move from one QR per received lot to
   one permanent QR per item, which sums each item's existing lot balances
   into its new running total exactly once — without losing anything.
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
   `supabase/seed_mockup_interior_100.sql` adds a second, independent ~100-item
   catalog in the same style, themed around interior/building-maintenance work
   instead of construction-site materials — flooring, ceilings, furniture,
   curtains & blinds (four new categories, added by this file), plus more
   interior-relevant items folded into Hardware, Electrical, Sanitary Ware,
   Paint, Lumber, and Cleaning Supplies. Run it any time after `schema.sql`,
   independently of `seed_mockup_100.sql` (either order, both, or neither) —
   its `sku_code`s don't collide with either. (Regenerate or edit from
   `scripts/gen_mockup_seed_interior.py`.)
3. **Create the first admin account, once.** `admin.html` now uses real
   per-person Supabase Auth accounts — three roles (Requester, Staff, Admin;
   see "Roles" below) rather than one shared password. In your Supabase
   project: **Authentication → Users → Add user**, email
   `admin@warehouse.local`, pick a password, and toggle **Auto Confirm User**
   on (so it doesn't wait on a confirmation email that will never arrive).
   Running `schema.sql` automatically gives that specific email an `admin`
   profile the moment it exists (see the bootstrap block under "1c. User
   profiles" in the file) — so create the account *before* or *after*
   running the schema, either order works. This is the one and only account
   that has to be created by hand this way — a chicken-and-egg requirement,
   since adding everyone else from inside the app (step 4, then "Roles"
   below) needs an admin to already be signed in.
4. **Deploy the `create-staff-login` Edge Function, once.** This is what
   lets an admin add a new person from inside Manage Staff without touching
   the Supabase dashboard. In your Supabase project: **Edge Functions →
   Create a new function**, name it exactly `create-staff-login` (must
   match the name the app calls it by), paste in the full contents of
   `supabase/functions/create-staff-login/index.ts`, and **Deploy**.
   Nothing else to configure — the service_role key it needs is injected
   into every Edge Function automatically by the platform, you never paste
   it in yourself. (Prefer the CLI? `supabase functions deploy
   create-staff-login` works too, once the project is linked — the
   Dashboard path above needs no extra tooling, so it's the one documented
   here.)
5. **Credentials are already wired up** in `js/config.js` (your project URL
   and anon/publishable key). If you ever rotate the anon key, update it
   there — never put the `service_role` key in this file, it bypasses Row
   Level Security entirely and this file ships to every browser that loads
   the app. (The Edge Function in step 4 is the one place this app's
   service_role key is used at all, and it never leaves Supabase's own
   servers.)
6. **Open the app.** Double-clicking `index.html` works for a first look, but
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
- **Admin login** (`admin.html`) — real, per-person Supabase Auth accounts
  gate the admin app, each with its own role (Requester / Staff / Admin —
  see "Roles" below) deciding what they see: Stock, Receive, Scan, Requests,
  Reports. This isn't just a UI curtain: Row Level Security refuses
  Requester accounts real database access to anything past their own
  requests, at the database level.
- **Stock** — current on-hand quantity per SKU (one running total,
  `qty_on_hand`, kept directly on the item — see "One QR per item" below),
  filterable by category and searchable by SKU code or name, with a
  low-stock flag driven by each SKU's threshold. A "Manage items" button
  opens full CRUD on the item master:
  add a SKU, edit any field, deactivate (soft-delete — history is kept) or
  reactivate one, and print/reprint that item's permanent QR sticker on
  demand — one at a time, or check several items (a "select all" toggle
  is there too) and print them together as one sheet of individually
  cuttable stickers on plain A4 paper. Deactivated items drop out of
  Receive and New Request pickers but stay visible, separately listed, in
  Manage items.
- **One QR per item, not per batch.** Every SKU has a single permanent QR
  sticker (encoding just its `sku_code` — never a quantity, since a printed
  sticker can't be updated later), printed once and stuck on the shelf/bin
  for the item's whole life, rather than a new sticker per delivery. Stock is
  one running total per item instead of a sum across separate lot balances.
  (The system briefly worked the older way — one QR per received batch/lot;
  `supabase/schema.sql` still carries that history as a legacy `lots` table
  so nothing from before the 2026-09-08 migration was lost, but nothing
  written since reads or writes it — see the "2. Lots" comment in that file.)
- **Receive / Return** — a segmented toggle at the top of this tab switches
  between the two. Receive logs a new delivery (item, quantity, unit,
  supplier ref); Return logs materials coming back into stock (item,
  quantity, an optional freeform note, who's returning it) — freeform on
  purpose, not tied to a specific original request, since a site return in
  practice often isn't cleanly one pickup's worth. Both add straight onto
  the item's running total and show its one permanent sticker afterward
  (print it if this is the item's first delivery and it doesn't have one on
  the shelf yet — reprints are always available from Manage items).
- **Scan** — camera-based QR scanning (falls back to typing the item code)
  to look up an item by its permanent sticker, then either **Issue**
  (deduct — pick which open request it fulfills, confirm the actual
  quantity) or **Receive more** (add stock on the spot, no request needed) —
  the same scanned code drives both directions. The scan screen defaults to
  whichever action makes sense: Issue when there's an open request for that
  item, Receive more when there isn't. A mismatch between requested and
  actual quantity on Issue still deducts stock but logs a discrepancy rather
  than silently accepting it or blocking the transaction — see the
  Discrepancies report. Whoever is picking the order up types their name
  here; it's recorded as the request's `picked_up_by`.
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
  (SKU, name, who performed it, requester, date, etc).
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
  anything, including the row it just created. Everything past that door
  requires a real, per-person login — see "Roles" below.
- **Roles.** `admin.html` is gated by real Supabase Auth accounts, one per
  person, each with a `user_profiles` row (name/role/department — see
  "1c. User profiles" in `schema.sql`). Three roles:
  - **Requester** — logs in, submits item requests tied to their own
    identity (`requester_user_id`), and sees only their own request
    history. This is separate from, and additional to, the anonymous
    public form above — that stays open to anyone with the link; a
    Requester account is for someone who asks often enough to want their
    own login and history.
  - **Staff** — "handles stock": Stock (view), Receive/Return, Scan/Issue,
    and the full Requests queue (progress status, fulfill via scan,
    including on a Requester's behalf).
  - **Admin** — everything Staff has, plus Manage Items, Reports, and
    Manage Staff (adding people and setting their role).

  Staff-vs-Admin (Manage Items/Reports) is enforced in the app's UI only —
  not by Row Level Security — since both are already trusted, logged-in
  warehouse staff; a small risk accepted deliberately for a small team.
  Requester-vs-everyone-else *is* enforced at the database level
  (`is_staff_or_admin()` in `schema.sql`), since Requester accounts are
  expected to be a much larger, less-vetted population — anyone across the
  organization who requests materials, not just the warehouse team.

  Approving a request now records *who*: `set_request_status()` stamps
  `approved_by` from the caller's own session, never a client-supplied
  value — shown as "Approved by `<name>`" once a request moves past
  pending. "Picked up by" (captured at the Scan/Issue step) stays a
  free-text field, same as before — a natural follow-up once this pattern
  proves out, not done in this pass.

  **Adding a person:** signed in as an Admin, open **Manage Staff** (the
  people icon next to the language toggle) and add their email, name,
  role, and department — the login is created automatically (via the
  `create-staff-login` Edge Function, Setup step 4) if that email doesn't
  already have one, and you'll get a one-time password shown once to share
  with them directly (chat, in person — it's never emailed). If the email
  already has a login (say, from before this feature existed, or created
  by hand in the dashboard), Manage Staff just attaches the profile to it
  instead of erroring. The only account that still has to be created by
  hand in the Supabase dashboard is the very first bootstrap admin (Setup
  step 3) — everyone after that goes through Manage Staff.
- **Unit conversion is stored, not yet enforced in the UI.** `alt_uom` and
  `conversion_factor` exist on each SKU, but Receive and Issue currently work
  in the SKU's base unit only. Wiring the conversion into the receive form
  (so staff can log "2 pallets" and have it convert to 100 bags) is a good
  v1.1 addition.
- **Stock deduction is transactional** via a Postgres function that locks
  the item's row (`for update`) before deducting, so two staff scanning the
  same item at once can't both succeed against a running total that's no
  longer there.

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
supabase/functions/create-staff-login/index.ts   Edge Function — creates a person's login from Manage Staff (see Setup step 4)
supabase/seed_mockup_100.sql   optional ~100-item Thai demo catalog (see Setup step 2)
scripts/gen_mockup_seed.py     regenerates seed_mockup_100.sql from an editable Python list
supabase/seed_mockup_interior_100.sql   optional ~100-item interior/maintenance catalog (see Setup step 2)
scripts/gen_mockup_seed_interior.py     regenerates seed_mockup_interior_100.sql
```

## Deploy version / cache-busting

Every local `<script src="js/...">` and `<link href="css/...">` tag in
index.html/admin.html/request.html carries a `?v=YYYYMMDDx` query string
(e.g. `?v=20260909a`), and the same string shows as a small grey label in the
bottom-right corner of every page (`.app-version`, hidden on print). Bump
**both** — every `?v=` tag and the `.app-version` text — together whenever
you push a JS/CSS change; otherwise a phone/browser that already cached the
old files has no signal to fetch the new ones, and Vercel redeploying doesn't
by itself clear an existing cached copy on someone's device. The visible
badge is there so you can glance at the corner of the screen and confirm
which build is actually loaded, instead of guessing.
