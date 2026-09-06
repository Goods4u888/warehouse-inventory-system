// ============================================================================
// Data access layer — every Supabase call the app makes lives here, so the
// view code never touches the client directly.
// ============================================================================

const supabaseClient = window.supabase.createClient(
  window.APP_CONFIG.SUPABASE_URL,
  window.APP_CONFIG.SUPABASE_ANON_KEY
);

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

  async createSku(sku) {
    const { data, error } = await supabaseClient.from('skus').insert(sku).select().single();
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

  async stockByLot(skuId = null) {
    let q = supabaseClient.from('stock_by_lot').select('*');
    if (skuId) q = q.eq('sku_id', skuId);
    const { data, error } = await q;
    if (error) throw error;
    return data;
  },

  async findLotByCode(lotCode) {
    const { data, error } = await supabaseClient
      .from('stock_by_lot')
      .select('*')
      .eq('lot_code', lotCode.trim())
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

  // ---- Issuing (scan-to-deduct) -----------------------------------------------
  async issueStock({ lotId, requestId, actualQty, performedBy }) {
    const { data, error } = await supabaseClient.rpc('issue_stock', {
      p_lot_id: lotId,
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
