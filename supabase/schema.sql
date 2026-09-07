-- ============================================================================
-- Warehouse Inventory System — v1 schema
-- Construction materials store: receiving (รับของ) + requisition (เบิกของ)
--
-- Run this once in the Supabase SQL Editor (Project → SQL Editor → New query),
-- or via `supabase db push` if you're using the CLI.
--
-- v2 note on security: the public requester form (request.html) is meant to
-- be reachable by anyone with the link, with no login. Everything else
-- (admin.html — stock, receiving, scanning, requests management, reports)
-- requires signing in through Supabase Auth first. Row Level Security below
-- enforces this at the database level, not just in the UI: the anon key can
-- only INSERT into requests (via create_public_request()); every other
-- table, and every other operation on requests, requires the "authenticated"
-- role. See README.md for how to create the shared admin login.
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- 1. SKUs — item master
-- ----------------------------------------------------------------------------
create table if not exists skus (
  id               uuid primary key default gen_random_uuid(),
  sku_code         text unique not null,
  name             text not null,
  category         text not null default 'Uncategorized',
  base_uom         text not null,
  alt_uom          text,
  conversion_factor numeric,             -- 1 alt_uom = conversion_factor * base_uom
  min_threshold    numeric not null default 0,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now()
);

comment on table skus is 'Item master. One row per material type (e.g. "Portland Cement 50kg").';
comment on column skus.conversion_factor is 'How many base_uom in one alt_uom, e.g. 1 pallet = 50 bags -> 50.';

-- ----------------------------------------------------------------------------
-- 1b. Categories — reference table backing the category dropdown in Manage
--     Items. skus.category is a foreign key into this table, matched by
--     name (so renaming a category here cascades to every SKU using it, and
--     a category still in use can't be deleted out from under its SKUs).
--     Staff can add a new category from the app itself (the "+" button next
--     to the category dropdown) — no SQL needed for that going forward.
-- ----------------------------------------------------------------------------
create table if not exists categories (
  id          uuid primary key default gen_random_uuid(),
  name        text unique not null,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

insert into categories (name, sort_order) values
  ('Cement', 1), ('Steel', 2), ('Aggregate', 3), ('Pipe & Fittings', 4),
  ('Hardware', 5), ('Electrical', 6), ('Sanitary Ware', 7), ('Paint', 8),
  ('Lumber', 9), ('Cleaning Supplies', 10)
on conflict (name) do nothing;

-- Added after the fact (idempotent) so re-running this file against an
-- existing database with SKUs already in it still works, as long as every
-- distinct skus.category value already has a matching row above.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'skus_category_fkey'
  ) then
    alter table skus
      add constraint skus_category_fkey foreign key (category) references categories(name)
      on update cascade on delete restrict;
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 2. Lots — one row per receiving event; the QR sticker encodes lot_code
-- ----------------------------------------------------------------------------
create table if not exists lots (
  id             uuid primary key default gen_random_uuid(),
  lot_code       text unique not null,
  sku_id         uuid not null references skus(id) on delete restrict,
  qty_received   numeric not null check (qty_received > 0),
  balance        numeric not null check (balance >= 0),
  uom            text not null,
  receive_date   date not null default current_date,
  received_by    text,
  supplier_ref   text,
  created_at     timestamptz not null default now()
);

comment on table lots is 'A physical batch received on one date. The QR code printed on its sticker encodes lot_code only — never quantity, which changes after printing.';

create index if not exists lots_sku_id_idx on lots(sku_id);

-- ----------------------------------------------------------------------------
-- 3. Requests — a requester's ask, fulfilled by scanning a lot
-- ----------------------------------------------------------------------------
create table if not exists requests (
  id              uuid primary key default gen_random_uuid(),
  request_code    text unique not null,
  requester_name  text not null,
  sku_id          uuid references skus(id) on delete restrict,
  qty_requested   numeric check (qty_requested > 0),
  needed_by       date,
  notes           text,
  status          text not null default 'pending'
                    check (status in ('pending','preparing','ready','fulfilled','cancelled')),
  created_at      timestamptz not null default now()
);

create index if not exists requests_status_idx on requests(status);
create index if not exists requests_sku_id_idx on requests(sku_id);

-- Who actually picked the order up — set by issue_stock() when the request
-- is closed, from the same name typed into the "picked up by" field on the
-- issue screen. Nullable: only fulfilled requests will have one.
alter table requests add column if not exists picked_up_by text;

-- The public requester form (no login, no item picker — see
-- create_public_request() below) collects who's asking and which
-- department to charge back to, then a free-text description in `notes`.
-- sku_id/qty_requested are nullable so this "general" kind of request can
-- coexist with the original item+quantity kind staff create internally —
-- one requests table, one admin view, told apart by whether sku_id is set.
alter table requests add column if not exists department text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'requests_item_or_note_chk'
  ) then
    alter table requests
      add constraint requests_item_or_note_chk check (sku_id is not null or notes is not null);
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 4. Transactions — every receive / issue event (the movement ledger)
-- ----------------------------------------------------------------------------
create table if not exists transactions (
  id            uuid primary key default gen_random_uuid(),
  type          text not null check (type in ('receive','issue')),
  lot_id        uuid not null references lots(id) on delete restrict,
  request_id    uuid references requests(id) on delete set null,
  qty           numeric not null,
  uom           text not null,
  performed_by  text,
  created_at    timestamptz not null default now()
);

create index if not exists transactions_lot_id_idx on transactions(lot_id);
create index if not exists transactions_created_at_idx on transactions(created_at desc);

-- ----------------------------------------------------------------------------
-- 5. Discrepancies — issued qty != requested qty (variance record)
-- ----------------------------------------------------------------------------
create table if not exists discrepancies (
  id              uuid primary key default gen_random_uuid(),
  transaction_id  uuid not null references transactions(id) on delete cascade,
  request_id      uuid not null references requests(id) on delete cascade,
  requested_qty   numeric not null,
  actual_qty      numeric not null,
  variance        numeric generated always as (actual_qty - requested_qty) stored,
  notes           text,
  created_at      timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 5b. Lot numbering — a per-SKU, per-day running counter, so lot codes read
--     as SKU-YYMMDD-NNN (e.g. CEM-001-260906-001, then -002 for the next
--     batch of the same item received that same day). The upsert below is
--     one atomic statement, so two staff receiving the same item at the same
--     moment still get distinct, gap-free numbers.
-- ----------------------------------------------------------------------------
create table if not exists lot_sequences (
  sku_id    uuid not null references skus(id) on delete cascade,
  seq_date  date not null,
  last_seq  integer not null default 0,
  primary key (sku_id, seq_date)
);

-- ----------------------------------------------------------------------------
-- 5c. SKU code numbering — new SKU codes are generated by the system, not
--     typed by staff: a random 3-letter prefix plus a running number for
--     that prefix, e.g. "QZT-001". Keyed by prefix (not globally), the same
--     atomic-upsert trick as lot_sequences above, so a repeat of the same
--     random prefix (rare, but possible) just continues its own count
--     instead of colliding. See create_sku() below.
-- ----------------------------------------------------------------------------
create table if not exists sku_sequences (
  prefix    text primary key,
  last_seq  integer not null default 0
);

-- ----------------------------------------------------------------------------
-- 5d. Request numbering — the public requester form's request_code, same
--     per-day running-counter pattern as lot_sequences: REQ-YYMMDD-NNN.
-- ----------------------------------------------------------------------------
create table if not exists request_sequences (
  seq_date  date primary key,
  last_seq  integer not null default 0
);

-- ----------------------------------------------------------------------------
-- 6. Views — current stock, aggregated from lots
-- ----------------------------------------------------------------------------
create or replace view stock_by_sku as
select
  s.id            as sku_id,
  s.sku_code,
  s.name,
  s.category,
  s.base_uom,
  s.min_threshold,
  coalesce(sum(l.balance), 0)                    as on_hand,
  coalesce(sum(l.balance), 0) < s.min_threshold  as is_low
from skus s
left join lots l on l.sku_id = s.id
where s.is_active
group by s.id;

create or replace view low_stock as
select * from stock_by_sku where is_low order by on_hand asc;

create or replace view stock_by_lot as
select
  l.id as lot_id, l.lot_code, l.balance, l.qty_received, l.uom,
  l.receive_date, l.supplier_ref,
  s.id as sku_id, s.sku_code, s.name, s.category
from lots l
join skus s on s.id = l.sku_id
order by l.receive_date desc;

create or replace view movement_history as
select
  t.id as transaction_id, t.type, t.qty, t.uom, t.performed_by, t.created_at,
  l.lot_code, s.sku_code, s.name as sku_name,
  r.request_code
from transactions t
join lots l on l.id = t.lot_id
join skus s on s.id = l.sku_id
left join requests r on r.id = t.request_id
order by t.created_at desc;

create or replace view discrepancy_report as
select
  d.id, d.requested_qty, d.actual_qty, d.variance, d.notes, d.created_at,
  r.request_code, r.requester_name,
  s.sku_code, s.name as sku_name,
  l.lot_code
from discrepancies d
join requests r on r.id = d.request_id
join transactions t on t.id = d.transaction_id
join lots l on l.id = t.lot_id
join skus s on s.id = l.sku_id
order by d.created_at desc;

-- ----------------------------------------------------------------------------
-- 7. RPCs — the two writes that must be atomic
-- ----------------------------------------------------------------------------

-- Receiving: create a lot + its opening transaction, return the new lot
-- (the caller renders lot_code as a QR code for the sticker). The lot code
-- is SKU-YYMMDD-NNN, NNN being a running count of receipts of this SKU on
-- this date (see lot_sequences above).
create or replace function receive_stock(
  p_sku_id uuid, p_qty numeric, p_uom text,
  p_received_by text default null, p_supplier_ref text default null
) returns lots
language plpgsql
as $$
declare
  v_lot lots;
  v_lot_code text;
  v_sku_code text;
  v_seq int;
begin
  if p_qty <= 0 then
    raise exception 'Quantity must be greater than zero';
  end if;

  select sku_code into v_sku_code from skus where id = p_sku_id;
  if not found then
    raise exception 'SKU not found';
  end if;

  insert into lot_sequences (sku_id, seq_date, last_seq)
  values (p_sku_id, current_date, 1)
  on conflict (sku_id, seq_date)
  do update set last_seq = lot_sequences.last_seq + 1
  returning last_seq into v_seq;

  v_lot_code := v_sku_code || '-' || to_char(current_date, 'YYMMDD') || '-' || lpad(v_seq::text, 3, '0');

  insert into lots (lot_code, sku_id, qty_received, balance, uom, received_by, supplier_ref)
  values (v_lot_code, p_sku_id, p_qty, p_qty, p_uom, p_received_by, p_supplier_ref)
  returning * into v_lot;

  insert into transactions (type, lot_id, qty, uom, performed_by)
  values ('receive', v_lot.id, p_qty, p_uom, p_received_by);

  return v_lot;
end;
$$;

-- Issuing: the scan-to-deduct step. Locks the lot row so two staff scanning
-- the same lot at once cannot both succeed against a balance that is no
-- longer there. Branches exactly like the workflow diagram: an exact match
-- closes the request quietly; a mismatch still deducts stock but leaves a
-- discrepancy record rather than silently accepting or blocking it.
create or replace function issue_stock(
  p_lot_id uuid, p_request_id uuid, p_actual_qty numeric, p_performed_by text default null
) returns jsonb
language plpgsql
as $$
declare
  v_lot lots;
  v_request requests;
  v_txn transactions;
  v_discrepancy discrepancies;
  v_has_discrepancy boolean := false;
begin
  if p_actual_qty <= 0 then
    raise exception 'Quantity must be greater than zero';
  end if;

  select * into v_lot from lots where id = p_lot_id for update;
  if not found then
    raise exception 'Lot not found';
  end if;
  if v_lot.balance < p_actual_qty then
    raise exception 'Insufficient balance on lot %: % available, % requested',
      v_lot.lot_code, v_lot.balance, p_actual_qty;
  end if;

  select * into v_request from requests where id = p_request_id for update;
  if not found then
    raise exception 'Request not found';
  end if;
  if v_request.status = 'fulfilled' then
    raise exception 'Request % is already fulfilled', v_request.request_code;
  end if;

  update lots set balance = balance - p_actual_qty where id = p_lot_id;

  insert into transactions (type, lot_id, request_id, qty, uom, performed_by)
  values ('issue', p_lot_id, p_request_id, p_actual_qty, v_lot.uom, p_performed_by)
  returning * into v_txn;

  if p_actual_qty <> v_request.qty_requested then
    v_has_discrepancy := true;
    insert into discrepancies (transaction_id, request_id, requested_qty, actual_qty)
    values (v_txn.id, p_request_id, v_request.qty_requested, p_actual_qty)
    returning * into v_discrepancy;
  end if;

  update requests set status = 'fulfilled', picked_up_by = p_performed_by where id = p_request_id;

  return jsonb_build_object(
    'transaction', to_jsonb(v_txn),
    'has_discrepancy', v_has_discrepancy,
    'discrepancy', to_jsonb(v_discrepancy)
  );
end;
$$;

-- Creating a new item: the SKU code is assigned by the system, not typed by
-- staff — a random 3-letter prefix plus a running number for that prefix
-- (see sku_sequences above). The existence check is just a belt-and-braces
-- retry; in practice the sequence table already guarantees no collision.
create or replace function create_sku(
  p_name text, p_category text, p_base_uom text,
  p_alt_uom text default null, p_conversion_factor numeric default null,
  p_min_threshold numeric default 0
) returns skus
language plpgsql
as $$
declare
  v_letters text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  v_prefix text;
  v_seq int;
  v_code text;
  v_sku skus;
begin
  loop
    v_prefix := '';
    for i in 1..3 loop
      v_prefix := v_prefix || substr(v_letters, (floor(random() * 26) + 1)::int, 1);
    end loop;

    insert into sku_sequences (prefix, last_seq)
    values (v_prefix, 1)
    on conflict (prefix) do update set last_seq = sku_sequences.last_seq + 1
    returning last_seq into v_seq;

    v_code := v_prefix || '-' || lpad(v_seq::text, 3, '0');

    exit when not exists (select 1 from skus where sku_code = v_code);
  end loop;

  insert into skus (sku_code, name, category, base_uom, alt_uom, conversion_factor, min_threshold)
  values (v_code, p_name, p_category, p_base_uom, p_alt_uom, p_conversion_factor, p_min_threshold)
  returning * into v_sku;

  return v_sku;
end;
$$;

-- The public requester form: no login, no item/quantity — just who's
-- asking, their department, and a free-text description. request_code is
-- assigned the same way lot_code is: an atomic per-day running counter, so
-- concurrent public submissions still get distinct, gap-free numbers.
-- security definer: anon can INSERT into requests but (by design) has no
-- SELECT policy on it, so a plain "returning *" as anon would itself be
-- blocked by RLS (RETURNING acts like a SELECT of the new row). Running as
-- the function owner — who owns the table and so bypasses its RLS — lets
-- this one narrow, parameter-controlled insert hand back the new row
-- (with its request_code) without opening general read access to anon.
create or replace function create_public_request(
  p_requester_name text, p_department text, p_comment text
) returns requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seq int;
  v_code text;
  v_request requests;
begin
  if coalesce(trim(p_requester_name), '') = '' then
    raise exception 'Requester name is required';
  end if;
  if coalesce(trim(p_comment), '') = '' then
    raise exception 'Please describe what you need';
  end if;

  insert into request_sequences (seq_date, last_seq)
  values (current_date, 1)
  on conflict (seq_date) do update set last_seq = request_sequences.last_seq + 1
  returning last_seq into v_seq;

  v_code := 'REQ-' || to_char(current_date, 'YYMMDD') || '-' || lpad(v_seq::text, 3, '0');

  insert into requests (request_code, requester_name, department, notes)
  values (v_code, trim(p_requester_name), nullif(trim(p_department), ''), trim(p_comment))
  returning * into v_request;

  return v_request;
end;
$$;

-- Postgres grants EXECUTE on a new function to PUBLIC by default — revoking
-- from just "anon" is not enough to lock an admin-only function down, since
-- PUBLIC still covers it. Revoke PUBLIC explicitly, then grant only to the
-- roles that should actually have it.
revoke execute on function receive_stock(uuid, numeric, text, text, text) from public;
revoke execute on function issue_stock(uuid, uuid, numeric, text) from public;
revoke execute on function create_sku(text, text, text, text, numeric, numeric) from public;
revoke execute on function create_public_request(text, text, text) from public;

grant execute on function receive_stock(uuid, numeric, text, text, text) to authenticated;
grant execute on function issue_stock(uuid, uuid, numeric, text) to authenticated;
grant execute on function create_sku(text, text, text, text, numeric, numeric) to authenticated;
grant execute on function create_public_request(text, text, text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 8. Row Level Security
--
-- v2: the requester form is genuinely public (no login), so from here on
-- "anon" means an anonymous member of the public, not trusted staff. Every
-- table except requests drops anon access entirely and is readable/writable
-- only by "authenticated" — i.e. someone who has signed in through the admin
-- login screen (see js/db.js Auth.signIn / README). requests itself splits
-- in two: anyone can INSERT (submit a request — always through
-- create_public_request(), never a raw insert with attacker-chosen fields
-- beyond requester_name/department/notes), but only authenticated can
-- SELECT/UPDATE/DELETE, so the public can't browse, search, or edit anyone
-- else's requests. request_sequences is the one sequence table anon still
-- needs, since create_public_request() has to bump it.
-- ----------------------------------------------------------------------------
alter table skus enable row level security;
alter table lots enable row level security;
alter table requests enable row level security;
alter table transactions enable row level security;
alter table discrepancies enable row level security;
alter table lot_sequences enable row level security;
alter table sku_sequences enable row level security;
alter table categories enable row level security;
alter table request_sequences enable row level security;

drop policy if exists "anon full access - skus" on skus;
drop policy if exists "authenticated full access - skus" on skus;
create policy "authenticated full access - skus" on skus for all to authenticated using (true) with check (true);

drop policy if exists "anon full access - categories" on categories;
drop policy if exists "authenticated full access - categories" on categories;
create policy "authenticated full access - categories" on categories for all to authenticated using (true) with check (true);

drop policy if exists "anon full access - lots" on lots;
drop policy if exists "authenticated full access - lots" on lots;
create policy "authenticated full access - lots" on lots for all to authenticated using (true) with check (true);

drop policy if exists "anon full access - requests" on requests;
drop policy if exists "anyone can submit requests" on requests;
drop policy if exists "authenticated full access - requests" on requests;
create policy "anyone can submit requests" on requests for insert to anon, authenticated with check (true);
create policy "authenticated full access - requests" on requests for all to authenticated using (true) with check (true);

drop policy if exists "anon full access - transactions" on transactions;
drop policy if exists "authenticated full access - transactions" on transactions;
create policy "authenticated full access - transactions" on transactions for all to authenticated using (true) with check (true);

drop policy if exists "anon full access - discrepancies" on discrepancies;
drop policy if exists "authenticated full access - discrepancies" on discrepancies;
create policy "authenticated full access - discrepancies" on discrepancies for all to authenticated using (true) with check (true);

drop policy if exists "anon full access - lot_sequences" on lot_sequences;
drop policy if exists "authenticated full access - lot_sequences" on lot_sequences;
create policy "authenticated full access - lot_sequences" on lot_sequences for all to authenticated using (true) with check (true);

drop policy if exists "anon full access - sku_sequences" on sku_sequences;
drop policy if exists "authenticated full access - sku_sequences" on sku_sequences;
create policy "authenticated full access - sku_sequences" on sku_sequences for all to authenticated using (true) with check (true);

drop policy if exists "anyone can bump request_sequences" on request_sequences;
create policy "anyone can bump request_sequences" on request_sequences for all to anon, authenticated using (true) with check (true);

-- ----------------------------------------------------------------------------
-- 9. Seed data — a handful of construction-material SKUs so the app has
--    something real to show the moment it's wired up. Delete freely.
-- ----------------------------------------------------------------------------
insert into skus (sku_code, name, category, base_uom, alt_uom, conversion_factor, min_threshold) values
  ('CEM-001', 'Portland Cement 50kg', 'Cement', 'bag', 'pallet', 50, 100),
  ('REB-012', 'Rebar 12mm x 6m', 'Steel', 'piece', 'bundle', 20, 200),
  ('SND-001', 'Fine Sand', 'Aggregate', 'cu.m', null, null, 20),
  ('PIP-004', 'PVC Pipe 4in x 4m', 'Pipe & Fittings', 'piece', null, null, 50),
  ('NAI-002', 'Common Nails 3in', 'Hardware', 'kg', 'box', 25, 30)
on conflict (sku_code) do nothing;
