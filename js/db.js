// ============================================================================
// Data access layer — every Supabase call the app makes lives here, so the
// view code never touches the client directly.
// ============================================================================

const supabaseClient = window.supabase.createClient(
  window.APP_CONFIG.SUPABASE_URL,
  window.APP_CONFIG.SUPABASE_ANON_KEY
);

// ---- Admin auth -----------------------------------------------------------
// admin.html is gated by real per-person Supabase Auth accounts (Requester /
// Staff / Admin — see the user_profiles table in schema.sql), each created
// by hand in the Supabase dashboard and given a matching user_profiles row
// through the in-app Manage Staff screen. See README.md.
const Auth = {
  async signIn(email, password) {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  },
  async signOut() {
    await supabaseClient.auth.signOut();
  },
  async getSession() {
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) throw error;
    return data.session;
  },
  onChange(cb) {
    supabaseClient.auth.onAuthStateChange((_event, session) => cb(session));
  },
};

const DB = {
  // ---- Profiles / roles ---------------------------------------------------
  // getMyProfile() is called right after every successful sign-in (see
  // initApp() in app.js) to learn the caller's own name/role — RLS lets
  // anyone read their own row (see schema.sql) but not anyone else's, so
  // this is always exactly the signed-in person's profile.
  async getMyProfile() {
    const { data: { user }, error: userErr } = await supabaseClient.auth.getUser();
    if (userErr) throw userErr;
    if (!user) return null;
    const { data, error } = await supabaseClient.from('user_profiles').select('*').eq('id', user.id).maybeSingle();
    if (error) throw error;
    return data;
  },

  // Manage Staff (admin-only — RLS refuses these to anyone else). Creating
  // the underlying login is still a manual step in the Supabase dashboard
  // (Authentication -> Users -> Add user, same as the original single
  // admin account) — there's no service_role key in this app to do that
  // from the browser (see js/config.js). This only manages the profile
  // (name/role/department/active) layered on top of that account.
  async listStaff() {
    const { data, error } = await supabaseClient.from('user_profiles').select('*').order('name');
    if (error) throw error;
    return data;
  },

  // Resolves the email an admin just created in the Supabase dashboard into
  // the uuid a profile row actually keys on — auth.users isn't queryable
  // from the client directly. null means no account exists for that email
  // yet (create it in the dashboard first).
  async findAuthUserId(email) {
    const { data, error } = await supabaseClient.rpc('find_auth_user_id', { p_email: email });
    if (error) throw error;
    return data;
  },

  // id must already exist as a Supabase Auth user (created in the
  // dashboard first) — this only inserts/updates their profile row.
  async upsertProfile({ id, name, role, department, isActive }) {
    const { data, error } = await supabaseClient
      .from('user_profiles')
      .upsert({ id, name, role, department: department || null, is_active: isActive })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  // ---- SKUs ---------------------------------------------------------------
  async listSkus({ activeOnly = true } = {}) {
    let q = supabaseClient.from('skus').select('*').order('name');
    if (activeOnly) q = q.eq('is_active', true);
    const { data, error } = await q;
    if (error) throw error;
    return data;
  },

  // Used by the public request form's item search. anon can only ever see
  // active items here (see "anon can view active skus" in schema.sql) — this
  // is the same query as listSkus({activeOnly:true}) but named separately
  // since it's called from a page with no login at all.
  async listActiveSkusForRequest() {
    const { data, error } = await supabaseClient
      .from('skus')
      .select('id, sku_code, name, category, base_uom')
      .eq('is_active', true)
      .order('name');
    if (error) throw error;
    return data;
  },

  // sku_code is assigned by the system (random 3-letter prefix + running
  // number, e.g. "QZT-001") — create_sku() generates it server-side, so it's
  // never part of the payload the caller sends here.
  async createSku({ name, category, base_uom, alt_uom, conversion_factor, min_threshold }) {
    const { data, error } = await supabaseClient.rpc('create_sku', {
      p_name: name,
      p_category: category,
      p_base_uom: base_uom,
      p_alt_uom: alt_uom || null,
      p_conversion_factor: conversion_factor ?? null,
      p_min_threshold: min_threshold ?? 0,
    });
    if (error) throw error;
    return data;
  },

  async updateSku(id, patch) {
    const { data, error } = await supabaseClient.from('skus').update(patch).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },

  async setSkuActive(id, isActive) {
    return DB.updateSku(id, { is_active: isActive });
  },

  // ---- Categories -----------------------------------------------------------
  async listCategories() {
    const { data, error } = await supabaseClient.from('categories').select('*').order('sort_order').order('name');
    if (error) throw error;
    return data;
  },

  async createCategory(name) {
    const { data, error } = await supabaseClient.from('categories').insert({ name }).select().single();
    if (error) throw error;
    return data;
  },

  // ---- Stock (views) -------------------------------------------------------
  async stockBySku() {
    const { data, error } = await supabaseClient.from('stock_by_sku').select('*').order('sku_code');
    if (error) throw error;
    return data;
  },

  async lowStock() {
    const { data, error } = await supabaseClient.from('low_stock').select('*');
    if (error) throw error;
    return data;
  },

  // LEGACY — stock_by_lot still exists purely so pre-migration batch history
  // stays queryable; nothing in the app calls this anymore (scanning looks
  // an item up by sku_code via findSkuByCode below, not by lot_code). Left
  // here in case it's ever useful for a one-off lookup.
  async stockByLot(skuId = null) {
    let q = supabaseClient.from('stock_by_lot').select('*');
    if (skuId) q = q.eq('sku_id', skuId);
    const { data, error } = await q;
    if (error) throw error;
    return data;
  },

  // Every item now has one permanent QR sticker encoding its sku_code —
  // this is what the scan screen calls to look an item up.
  async findSkuByCode(skuCode) {
    const { data, error } = await supabaseClient
      .from('stock_by_sku')
      .select('*')
      .eq('sku_code', skuCode.trim())
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  // ---- Receiving ------------------------------------------------------------
  async receiveStock({ skuId, qty, uom, receivedBy, supplierRef }) {
    const { data, error } = await supabaseClient.rpc('receive_stock', {
      p_sku_id: skuId,
      p_qty: qty,
      p_uom: uom,
      p_received_by: receivedBy || null,
      p_supplier_ref: supplierRef || null,
    });
    if (error) throw error;
    return data;
  },

  // ---- Returns ----------------------------------------------------------------
  // Materials that were issued/taken out coming back into stock. Adds
  // straight onto the item's qty_on_hand, same as receiving — see
  // return_stock() in schema.sql. Freeform: not tied to a specific original
  // request.
  async returnStock({ skuId, qty, uom, returnedBy, note }) {
    const { data, error } = await supabaseClient.rpc('return_stock', {
      p_sku_id: skuId,
      p_qty: qty,
      p_uom: uom,
      p_returned_by: returnedBy || null,
      p_note: note || null,
    });
    if (error) throw error;
    return data;
  },

  // ---- Requests ---------------------------------------------------------------
  async listRequests({ status = null } = {}) {
    // approver:user_profiles!approved_by(name) — explicit FK hint since
    // requests has two FKs into user_profiles (approved_by and
    // requester_user_id); without naming which one, PostgREST can't tell
    // which relationship to embed.
    let q = supabaseClient
      .from('requests')
      .select('*, skus(sku_code, name, base_uom), approver:user_profiles!approved_by(name)')
      .order('created_at', { ascending: false });
    if (status) q = q.eq('status', status);
    const { data, error } = await q;
    if (error) throw error;
    return data;
  },

  // Used by both the Requester role's own "new request" form and
  // Staff/Admin's internal "+ New" — one RPC instead of the raw insert this
  // used to be. requesterName/department are a Staff/Admin-only "who this
  // is actually for" override (a walk-in who called it in); the RPC
  // ignores both for a Requester-role caller and always uses their own
  // profile instead, so nobody can submit under someone else's name.
  async createRequest({ skuId, qty, neededBy, notes, requesterName, department }) {
    const { data, error } = await supabaseClient.rpc('create_authenticated_request', {
      p_sku_id: skuId,
      p_qty: qty,
      p_needed_by: neededBy || null,
      p_notes: notes || null,
      p_requester_name: requesterName || null,
      p_department: department || null,
    });
    if (error) throw error;
    return data;
  },

  // approved_by is stamped server-side from auth.uid() inside the function
  // — never sent from here — so the "who approved this" trail can't be
  // spoofed by the client. Row Level Security also means this simply fails
  // for a requester-role caller, including on their own requests.
  async setRequestStatus(id, status) {
    const { data, error } = await supabaseClient.rpc('set_request_status', {
      p_request_id: id,
      p_status: status,
    });
    if (error) throw error;
    return data;
  },

  // The public requester form (no login) — a list of items (each { skuId,
  // qty }), a free-text comment, or both; request_code is assigned by the
  // system the same way lot/SKU codes are (see schema.sql). Returns an
  // array: one row per item, all sharing one request_code (or a single
  // row for a comment-only submission).
  async createPublicRequest({ requesterName, department, comment, workArea, items }) {
    const { data, error } = await supabaseClient.rpc('create_public_request', {
      p_requester_name: requesterName,
      p_department: department || null,
      p_comment: comment || null,
      p_work_area: workArea,
      p_items: items && items.length ? items.map((i) => ({ sku_id: i.skuId, qty: i.qty })) : null,
    });
    if (error) throw error;
    return data;
  },

  // ---- Issuing (scan-to-deduct) -----------------------------------------------
  async issueStock({ skuId, requestId, actualQty, performedBy }) {
    const { data, error } = await supabaseClient.rpc('issue_stock', {
      p_sku_id: skuId,
      p_request_id: requestId,
      p_actual_qty: actualQty,
      p_performed_by: performedBy || null,
    });
    if (error) throw error;
    return data;
  },

  // ---- Reports ----------------------------------------------------------------
  async movementHistory(limit = 100) {
    const { data, error } = await supabaseClient
      .from('movement_history')
      .select('*')
      .limit(limit);
    if (error) throw error;
    return data;
  },

  // Recent activity for one item (Stock -> tap a card -> item detail sheet).
  // Same movement_history view as the Reports tab, filtered/limited server-side
  // instead of pulling the whole ledger and filtering client-side.
  async movementHistoryForSku(skuCode, limit = 5) {
    const { data, error } = await supabaseClient
      .from('movement_history')
      .select('*')
      .eq('sku_code', skuCode)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data;
  },

  async discrepancyReport() {
    const { data, error } = await supabaseClient.from('discrepancy_report').select('*');
    if (error) throw error;
    return data;
  },
};
