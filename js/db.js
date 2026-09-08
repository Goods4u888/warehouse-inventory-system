// ============================================================================
// Data access layer — every Supabase call the app makes lives here, so the
// view code never touches the client directly.
// ============================================================================

const supabaseClient = window.supabase.createClient(
  window.APP_CONFIG.SUPABASE_URL,
  window.APP_CONFIG.SUPABASE_ANON_KEY
);

// ---- Admin auth -----------------------------------------------------------
// The admin side (admin.html) is gated by a single shared login rather than
// per-person accounts. Under the hood it's still real Supabase Auth (so Row
// Level Security can actually tell "logged-in staff" from "the public") —
// the email is a fixed, non-mailbox identifier fixed for this app; only the
// password is the real, per-deployment secret staff type in. See README.md
// for how to create this user once in the Supabase dashboard.
const ADMIN_EMAIL = 'admin@warehouse.local';

const Auth = {
  async signIn(password) {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email: ADMIN_EMAIL, password });
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

function requestCode() {
  const d = new Date();
  const y = String(d.getFullYear()).slice(-2);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `REQ-${y}${m}${day}-${rand}`;
}

const DB = {
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
    let q = supabaseClient
      .from('requests')
      .select('*, skus(sku_code, name, base_uom)')
      .order('created_at', { ascending: false });
    if (status) q = q.eq('status', status);
    const { data, error } = await q;
    if (error) throw error;
    return data;
  },

  async createRequest({ requesterName, skuId, qty, neededBy, notes }) {
    const { data, error } = await supabaseClient
      .from('requests')
      .insert({
        request_code: requestCode(),
        requester_name: requesterName,
        sku_id: skuId,
        qty_requested: qty,
        needed_by: neededBy || null,
        notes: notes || null,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async setRequestStatus(id, status) {
    const { data, error } = await supabaseClient.from('requests').update({ status }).eq('id', id).select().single();
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

  async discrepancyReport() {
    const { data, error } = await supabaseClient.from('discrepancy_report').select('*');
    if (error) throw error;
    return data;
  },
};
