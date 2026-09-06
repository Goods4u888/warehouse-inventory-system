// ============================================================================
// View router + UI wiring. DB.* does all data access, QR.* does codes/camera,
// I18n/t() does display strings.
// ============================================================================

const CATS = {
  Cement: 'cement', Steel: 'steel', Aggregate: 'aggregate',
  'Pipe & Fittings': 'hardware', Hardware: 'hardware',
};
function catClass(category) {
  return CATS[category] || 'other';
}
function fmtQty(n) {
  const num = Number(n);
  return Number.isInteger(num) ? String(num) : num.toFixed(2).replace(/\.?0+$/, '');
}
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
function fmtDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
function statusLabel(status) {
  const map = {
    all: t('statusAll'), pending: t('statusPending'), preparing: t('statusPreparing'),
    ready: t('statusReady'), fulfilled: t('statusFulfilled'), cancelled: t('statusCancelled'),
  };
  return map[status] || status;
}

// ---- Toast -------------------------------------------------------------------
function toast(msg, kind = '') {
  const host = document.getElementById('toast-host');
  const el = document.createElement('div');
  el.className = `toast ${kind}`.trim();
  el.textContent = msg;
  host.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

// ---- Sheet (bottom modal) -------------------------------------------------------
const Sheet = {
  open(title, bodyHtml) {
    document.getElementById('sheet-title').textContent = title;
    document.getElementById('sheet-body').innerHTML = bodyHtml;
    document.getElementById('scrim').hidden = false;
  },
  close() {
    document.getElementById('scrim').hidden = true;
    document.getElementById('sheet-body').innerHTML = '';
  },
};
document.getElementById('sheet-close').addEventListener('click', Sheet.close);
document.getElementById('scrim').addEventListener('click', (e) => {
  if (e.target.id === 'scrim') Sheet.close();
});

// ---- Language ----------------------------------------------------------------
document.getElementById('lang-toggle').addEventListener('click', () => {
  I18n.setLang(I18n.current === 'th' ? 'en' : 'th');
});
// Called by I18n.setLang() after it repaints every data-i18n element. Anything
// built by JS (not plain markup) needs its own re-render here.
function onLanguageChange() {
  renderRequestTabs();
  if (currentView === 'stock') { renderStockFacets(); renderStock(); }
  else if (currentView === 'receive') { loadReceiveForm(); }
  else if (currentView === 'issue') { resetScanView(); }
  else if (currentView === 'requests') { loadRequests(); }
  else if (currentView === 'reports') { loadReport(currentReport); }
}

// ---- Router --------------------------------------------------------------------
const VIEWS = ['stock', 'receive', 'issue', 'requests', 'reports'];
let currentView = 'stock';

function showView(name) {
  if (currentView === 'issue' && name !== 'issue') {
    QR.stopScanner(document.getElementById('scan-video'));
  }
  currentView = name;
  VIEWS.forEach((v) => {
    document.getElementById(`view-${v}`).hidden = v !== name;
  });
  document.querySelectorAll('.tabbar button').forEach((b) => {
    if (b.dataset.view === name) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  if (name === 'stock') loadStock();
  if (name === 'receive') loadReceiveForm();
  if (name === 'issue') resetScanView();
  if (name === 'requests') loadRequests();
  if (name === 'reports') loadReport(currentReport);
}

document.querySelectorAll('.tabbar button').forEach((b) => {
  b.addEventListener('click', () => showView(b.dataset.view));
});
document.getElementById('btn-refresh').addEventListener('click', () => showView(currentView));

// ============================================================================
// STOCK
// ============================================================================
let stockRows = [];
let stockFacet = 'all';

async function loadStock() {
  const list = document.getElementById('stock-list');
  list.innerHTML = skeletonCards(4);
  try {
    stockRows = await DB.stockBySku();
    renderStockFacets();
    renderStock();
  } catch (err) {
    list.innerHTML = '';
    toast(err.message || 'Could not load stock', 'error');
  }
}

function renderStockFacets() {
  const cats = ['all', ...new Set(stockRows.map((r) => r.category))];
  const el = document.getElementById('stock-facets');
  el.innerHTML = cats.map((c) => `
    <button class="facet" data-cat="${escapeHtml(c)}" aria-pressed="${c === stockFacet}">${c === 'all' ? t('facetAll') : escapeHtml(c)}</button>
  `).join('');
  el.querySelectorAll('.facet').forEach((btn) => {
    btn.addEventListener('click', () => { stockFacet = btn.dataset.cat; renderStockFacets(); renderStock(); });
  });
}

function renderStock() {
  const rows = stockFacet === 'all' ? stockRows : stockRows.filter((r) => r.category === stockFacet);
  document.getElementById('stock-total').textContent = stockRows.length;
  document.getElementById('stock-low-count').textContent = stockRows.filter((r) => r.is_low).length;

  const list = document.getElementById('stock-list');
  if (!rows.length) {
    list.innerHTML = `<div class="empty"><p>${t('emptyStockCategory')}</p></div>`;
    return;
  }
  list.innerHTML = rows.map((r) => `
    <div class="card">
      <div class="card-row">
        <div>
          <div class="card-title">${escapeHtml(r.name)}</div>
          <div class="card-meta mono">${escapeHtml(r.sku_code)}</div>
        </div>
        <div style="text-align:right">
          <div class="stat-figure" style="font-size:var(--t-sec)">${fmtQty(r.on_hand)}<span style="font-size:var(--t-micro);color:var(--ink-3)"> ${escapeHtml(r.base_uom)}</span></div>
        </div>
      </div>
      <div class="card-row" style="margin-top:var(--s3)">
        <span class="chip chip-cat-${catClass(r.category)}">${escapeHtml(r.category)}</span>
        ${r.is_low
          ? `<span class="chip chip-low"><span class="dot"></span>${t('chipBelowThreshold', fmtQty(r.min_threshold))}</span>`
          : `<span class="chip chip-ok"><span class="dot"></span>${t('chipOk')}</span>`}
      </div>
    </div>
  `).join('');
}

function skeletonCards(n) {
  return Array.from({ length: n }).map(() => `<div class="card"><div class="skeleton" style="height:52px"></div></div>`).join('');
}

// ============================================================================
// MANAGE ITEMS (SKU master-data CRUD)
// ============================================================================
let miAllSkus = [];
let miEditingId = null;

document.getElementById('btn-manage-items').addEventListener('click', openManageItemsSheet);

async function refreshSkuCaches() {
  try {
    activeSkus = await DB.listSkus({ activeOnly: true });
  } catch (_) { /* ignore — next view load will surface any real error */ }
  if (currentView === 'stock') loadStock();
}

function openManageItemsSheet() {
  Sheet.open(t('manageItemsTitle'), manageItemsSheetHtml());
  wireManageItemsForm();
  loadManageItemsList();
}

function manageItemsSheetHtml() {
  return `
    <div id="mi-error"></div>
    <form id="form-manage-item">
      <div class="field-row">
        <div class="field">
          <label for="mi-sku-code">${t('fieldSkuCode')}</label>
          <input type="text" id="mi-sku-code" required>
        </div>
        <div class="field">
          <label for="mi-category">${t('fieldCategory')}</label>
          <input type="text" id="mi-category" required>
        </div>
      </div>
      <div class="field">
        <label for="mi-name">${t('fieldName')}</label>
        <input type="text" id="mi-name" required>
      </div>
      <div class="field-row">
        <div class="field">
          <label for="mi-base-uom">${t('fieldBaseUom')}</label>
          <input type="text" id="mi-base-uom" required>
        </div>
        <div class="field">
          <label for="mi-min-threshold">${t('fieldMinThreshold')}</label>
          <input type="number" id="mi-min-threshold" min="0" step="any" required>
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label for="mi-alt-uom">${t('fieldAltUom')}</label>
          <input type="text" id="mi-alt-uom">
        </div>
        <div class="field">
          <label for="mi-conversion-factor">${t('fieldConversionFactor')}</label>
          <input type="number" id="mi-conversion-factor" min="0" step="any">
        </div>
      </div>
      <div class="card-row">
        <button type="button" class="btn btn-ghost" id="mi-cancel-edit" hidden>${t('cancel')}</button>
        <button type="submit" class="btn btn-primary btn-block" id="mi-submit">${t('addItem')}</button>
      </div>
    </form>

    <div class="section-head"><h2>${t('activeItems')}</h2></div>
    <div id="mi-active-list" class="card-list"></div>
    <div class="section-head"><h2>${t('inactiveItems')}</h2></div>
    <div id="mi-inactive-list" class="card-list"></div>
  `;
}

function wireManageItemsForm() {
  miEditingId = null;
  const form = document.getElementById('form-manage-item');
  form.addEventListener('submit', onManageItemSubmit);
  document.getElementById('mi-cancel-edit').addEventListener('click', () => {
    miEditingId = null;
    form.reset();
    document.getElementById('mi-submit').textContent = t('addItem');
    document.getElementById('mi-cancel-edit').hidden = true;
  });
}

async function onManageItemSubmit(e) {
  e.preventDefault();
  const errEl = document.getElementById('mi-error');
  errEl.innerHTML = '';
  const patch = {
    sku_code: document.getElementById('mi-sku-code').value.trim(),
    name: document.getElementById('mi-name').value.trim(),
    category: document.getElementById('mi-category').value.trim(),
    base_uom: document.getElementById('mi-base-uom').value.trim(),
    alt_uom: document.getElementById('mi-alt-uom').value.trim() || null,
    conversion_factor: document.getElementById('mi-conversion-factor').value
      ? parseFloat(document.getElementById('mi-conversion-factor').value) : null,
    min_threshold: parseFloat(document.getElementById('mi-min-threshold').value || '0'),
  };
  const btn = document.getElementById('mi-submit');
  btn.disabled = true;
  try {
    if (miEditingId) {
      await DB.updateSku(miEditingId, patch);
      toast(t('toastItemUpdated'), 'success');
    } else {
      await DB.createSku(patch);
      toast(t('toastItemCreated'), 'success');
    }
    miEditingId = null;
    e.target.reset();
    document.getElementById('mi-submit').textContent = t('addItem');
    document.getElementById('mi-cancel-edit').hidden = true;
    await loadManageItemsList();
    await refreshSkuCaches();
  } catch (err) {
    errEl.innerHTML = `<div class="form-error">${escapeHtml(err.message || 'Could not save item')}</div>`;
  } finally {
    btn.disabled = false;
  }
}

async function loadManageItemsList() {
  try {
    miAllSkus = await DB.listSkus({ activeOnly: false });
    renderManageItemsLists();
  } catch (err) {
    toast(err.message || 'Could not load items', 'error');
  }
}

function renderManageItemsLists() {
  const active = miAllSkus.filter((s) => s.is_active);
  const inactive = miAllSkus.filter((s) => !s.is_active);
  const activeEl = document.getElementById('mi-active-list');
  const inactiveEl = document.getElementById('mi-inactive-list');
  activeEl.innerHTML = active.length ? active.map(miRowHtml).join('') : `<div class="empty"><p>${t('emptyGeneric')}</p></div>`;
  inactiveEl.innerHTML = inactive.length ? inactive.map(miRowHtml).join('') : `<div class="empty"><p>${t('emptyGeneric')}</p></div>`;

  document.querySelectorAll('[data-mi-edit]').forEach((btn) => {
    btn.addEventListener('click', () => startEditSku(btn.dataset.miEdit));
  });
  document.querySelectorAll('[data-mi-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => toggleSkuActive(btn.dataset.miToggle, btn.dataset.toActive === 'true'));
  });
}

function miRowHtml(s) {
  return `
    <div class="card">
      <div class="card-row">
        <div>
          <div class="card-title">${escapeHtml(s.name)}</div>
          <div class="card-meta mono">${escapeHtml(s.sku_code)} · ${escapeHtml(s.category)} · ${escapeHtml(s.base_uom)}</div>
        </div>
      </div>
      <div class="card-row" style="margin-top:var(--s3)">
        <button class="btn btn-outline btn-sm" data-mi-edit="${s.id}">${t('btnEdit')}</button>
        ${s.is_active
          ? `<button class="btn btn-ghost btn-sm" data-mi-toggle="${s.id}" data-to-active="false">${t('btnDeactivate')}</button>`
          : `<button class="btn btn-ghost btn-sm" data-mi-toggle="${s.id}" data-to-active="true">${t('btnActivate')}</button>`}
      </div>
    </div>
  `;
}

function startEditSku(id) {
  const sku = miAllSkus.find((s) => s.id === id);
  if (!sku) return;
  miEditingId = id;
  document.getElementById('mi-sku-code').value = sku.sku_code;
  document.getElementById('mi-name').value = sku.name;
  document.getElementById('mi-category').value = sku.category;
  document.getElementById('mi-base-uom').value = sku.base_uom;
  document.getElementById('mi-alt-uom').value = sku.alt_uom || '';
  document.getElementById('mi-conversion-factor').value = sku.conversion_factor ?? '';
  document.getElementById('mi-min-threshold').value = sku.min_threshold;
  document.getElementById('mi-submit').textContent = t('saveChanges');
  document.getElementById('mi-cancel-edit').hidden = false;
  document.getElementById('sheet-body').scrollTop = 0;
}

async function toggleSkuActive(id, toActive) {
  try {
    await DB.setSkuActive(id, toActive);
    toast(toActive ? t('toastItemActivated') : t('toastItemDeactivated'), 'success');
    await loadManageItemsList();
    await refreshSkuCaches();
  } catch (err) {
    toast(err.message || 'Could not update item', 'error');
  }
}

// ============================================================================
// RECEIVE
// ============================================================================
let activeSkus = [];

async function loadReceiveForm() {
  document.getElementById('receive-result').innerHTML = '';
  document.getElementById('receive-error').innerHTML = '';
  try {
    activeSkus = await DB.listSkus({ activeOnly: true });
    const sel = document.getElementById('rc-sku');
    sel.innerHTML = activeSkus.map((s) => `<option value="${s.id}" data-uom="${escapeHtml(s.base_uom)}">${escapeHtml(s.sku_code)} — ${escapeHtml(s.name)}</option>`).join('');
    if (activeSkus.length) document.getElementById('rc-uom').value = activeSkus[0].base_uom;
    sel.onchange = () => {
      const opt = sel.options[sel.selectedIndex];
      document.getElementById('rc-uom').value = opt.dataset.uom;
    };
  } catch (err) {
    toast(err.message || 'Could not load items', 'error');
  }
}

document.getElementById('form-receive').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = document.getElementById('receive-error');
  errEl.innerHTML = '';
  const skuId = document.getElementById('rc-sku').value;
  const qty = parseFloat(document.getElementById('rc-qty').value);
  const uom = document.getElementById('rc-uom').value.trim();
  const supplierRef = document.getElementById('rc-supplier').value.trim();
  const receivedBy = document.getElementById('rc-by').value.trim();

  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true; btn.textContent = t('btnGenerating');
  try {
    const lot = await DB.receiveStock({ skuId, qty, uom, receivedBy, supplierRef });
    const sku = activeSkus.find((s) => s.id === skuId);
    renderReceiveResult(lot, sku);
    e.target.reset();
    loadReceiveForm();
    toast(t('toastLotReceived', lot.lot_code), 'success');
  } catch (err) {
    errEl.innerHTML = `<div class="form-error">${escapeHtml(err.message || 'Could not receive stock')}</div>`;
  } finally {
    btn.disabled = false; btn.textContent = t('btnGenerateLot');
  }
});

function renderReceiveResult(lot, sku) {
  const box = document.getElementById('receive-result');
  box.innerHTML = `
    <div class="card">
      <div class="eyebrow">${t('stickerReady')}</div>
      ${QR.stickerHtml({ lotCode: lot.lot_code, skuCode: sku.sku_code, skuName: sku.name, receiveDate: fmtDate(lot.receive_date) })}
      <button class="btn btn-outline btn-block" style="margin-top:var(--s4)" id="btn-print-sticker">${t('btnPrintSticker')}</button>
    </div>`;
  QR.renderInto(document.getElementById(`sticker-qr-${lot.lot_code}`), lot.lot_code, 120);
  document.getElementById('btn-print-sticker').addEventListener('click', () => window.print());
}

// ============================================================================
// ISSUE / SCAN
// ============================================================================
function resetScanView() {
  document.getElementById('scan-step-camera').hidden = false;
  document.getElementById('scan-step-issue').hidden = true;
  document.getElementById('scan-step-issue').innerHTML = '';
  document.getElementById('scan-manual').value = '';
  const status = document.getElementById('scan-status');
  status.textContent = t('scanHintDefault');

  const video = document.getElementById('scan-video');
  const canvas = document.getElementById('scan-canvas');
  QR.startScanner(video, canvas, onLotScanned, (err) => {
    status.textContent = t('scanHintNoCamera');
  });
}

document.getElementById('btn-lookup-lot').addEventListener('click', () => {
  const code = document.getElementById('scan-manual').value.trim();
  if (code) onLotScanned(code);
});

async function onLotScanned(lotCode) {
  QR.stopScanner(document.getElementById('scan-video'));
  document.getElementById('scan-status').textContent = t('scanLookingUp', lotCode);
  try {
    const lot = await DB.findLotByCode(lotCode);
    if (!lot) {
      toast(t('toastNoLot', lotCode), 'error');
      resetScanView();
      return;
    }
    const openRequests = await DB.listRequests({});
    const forThisSku = openRequests.filter((r) => r.sku_id === lot.sku_id && r.status !== 'fulfilled' && r.status !== 'cancelled');
    renderIssueStep(lot, forThisSku);
  } catch (err) {
    toast(err.message || 'Lookup failed', 'error');
    resetScanView();
  }
}

function renderIssueStep(lot, openRequests) {
  document.getElementById('scan-step-camera').hidden = true;
  const box = document.getElementById('scan-step-issue');
  box.hidden = false;
  box.innerHTML = `
    <div class="card">
      <div class="eyebrow">${t('lotFound')}</div>
      <div class="card-title">${escapeHtml(lot.name)}</div>
      <div class="card-meta mono">${escapeHtml(lot.lot_code)} · ${escapeHtml(lot.sku_code)}</div>
      <div class="card-row" style="margin-top:var(--s3)">
        <span class="chip chip-cat-${catClass(lot.category)}">${escapeHtml(lot.category)}</span>
        <span class="stat-figure" style="font-size:var(--t-card)">${t('unitLeft', fmtQty(lot.balance), escapeHtml(lot.uom))}</span>
      </div>
    </div>

    ${openRequests.length ? `
      <div class="field" style="margin-top:var(--s5)">
        <label for="issue-request">${t('fieldFulfillWhich')}</label>
        <select id="issue-request">
          ${openRequests.map((r) => `<option value="${r.id}" data-qty="${r.qty_requested}">${escapeHtml(t('optionRequestLine', r.request_code, r.requester_name, fmtQty(r.qty_requested), lot.uom))}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label for="issue-qty">${t('fieldActualQty')}</label>
        <input type="number" id="issue-qty" min="0.0001" step="any" max="${lot.balance}">
        <div class="field-hint" id="issue-qty-hint"></div>
      </div>
      <div class="field">
        <label for="issue-picked-up-by">${t('fieldPickedUpBy')}</label>
        <input type="text" id="issue-picked-up-by" placeholder="${escapeHtml(t('fieldReceivedByPh'))}">
      </div>
      <div id="issue-error"></div>
      <button class="btn btn-primary btn-block" id="btn-confirm-issue">${t('btnConfirmIssue')}</button>
      <button class="btn btn-ghost btn-block" id="btn-scan-again" style="margin-top:var(--s2)">${t('btnScanDifferent')}</button>
    ` : `
      <div class="empty" style="margin-top:var(--s5)">
        <p>${t('emptyNoOpenRequest')}</p>
        <button class="btn btn-outline" id="btn-scan-again">${t('btnScanDifferent')}</button>
      </div>
    `}
  `;

  document.getElementById('btn-scan-again')?.addEventListener('click', resetScanView);

  const reqSel = document.getElementById('issue-request');
  const qtyInput = document.getElementById('issue-qty');
  if (reqSel) {
    const syncDefault = () => {
      const opt = reqSel.options[reqSel.selectedIndex];
      qtyInput.value = opt.dataset.qty;
      document.getElementById('issue-qty-hint').textContent = t('hintRequested', fmtQty(opt.dataset.qty), lot.uom);
    };
    reqSel.addEventListener('change', syncDefault);
    syncDefault();
  }

  document.getElementById('btn-confirm-issue')?.addEventListener('click', async () => {
    const errEl = document.getElementById('issue-error');
    errEl.innerHTML = '';
    const requestId = reqSel.value;
    const actualQty = parseFloat(qtyInput.value);
    const requestedQty = parseFloat(reqSel.options[reqSel.selectedIndex].dataset.qty);
    const performedBy = document.getElementById('issue-picked-up-by').value.trim();

    if (!performedBy) {
      errEl.innerHTML = `<div class="form-error">${escapeHtml(t('fieldPickedUpByRequired'))}</div>`;
      return;
    }

    const btn = document.getElementById('btn-confirm-issue');
    btn.disabled = true; btn.textContent = t('btnConfirming');
    try {
      const result = await DB.issueStock({ lotId: lot.lot_id, requestId, actualQty, performedBy });
      if (result.has_discrepancy) {
        toast(t('toastIssuedDiscrepancy', fmtQty(requestedQty), fmtQty(actualQty)), 'error');
      } else {
        toast(t('toastIssuedClean'), 'success');
      }
      resetScanView();
    } catch (err) {
      errEl.innerHTML = `<div class="form-error">${escapeHtml(err.message || 'Could not confirm issue')}</div>`;
      btn.disabled = false; btn.textContent = t('btnConfirmIssue');
    }
  });
}

// ============================================================================
// REQUESTS
// ============================================================================
const REQUEST_STATUSES = ['all', 'pending', 'preparing', 'ready', 'fulfilled'];
let requestStatus = 'all';

function renderRequestTabs() {
  const el = document.getElementById('request-status-tabs');
  el.innerHTML = REQUEST_STATUSES.map((s) => `<button data-status="${s}" aria-pressed="${s === requestStatus}">${statusLabel(s)}</button>`).join('');
  el.querySelectorAll('button').forEach((b) => {
    b.addEventListener('click', () => { requestStatus = b.dataset.status; renderRequestTabs(); loadRequests(); });
  });
}
renderRequestTabs();

async function loadRequests() {
  const list = document.getElementById('requests-list');
  list.innerHTML = skeletonCards(3);
  try {
    const rows = await DB.listRequests({ status: requestStatus === 'all' ? null : requestStatus });
    if (!rows.length) {
      list.innerHTML = `<div class="empty"><p>${t('emptyRequests', requestStatus === 'all' ? '' : statusLabel(requestStatus) + ' ')}</p>
        <button class="btn btn-primary btn-sm" id="empty-new-request">${t('btnNewRequest')}</button></div>`;
      document.getElementById('empty-new-request')?.addEventListener('click', openNewRequestSheet);
      return;
    }
    list.innerHTML = rows.map((r) => `
      <div class="card">
        <div class="card-row">
          <div>
            <div class="card-title">${escapeHtml(r.skus?.name || 'Unknown item')}</div>
            <div class="card-meta">${escapeHtml(r.requester_name)} · ${fmtQty(r.qty_requested)} ${escapeHtml(r.skus?.base_uom || '')}</div>
          </div>
          <span class="chip ${statusChipClass(r.status)}">${statusLabel(r.status)}</span>
        </div>
        <div class="card-row" style="margin-top:var(--s3)">
          <span class="card-meta mono">${escapeHtml(r.request_code)} · ${t('neededBy', fmtDate(r.needed_by))}</span>
          ${nextStatusButton(r)}
        </div>
        ${r.status === 'fulfilled' && r.picked_up_by ? `<div class="card-meta" style="margin-top:var(--s2)">${escapeHtml(t('pickedUpBy', r.picked_up_by))}</div>` : ''}
      </div>
    `).join('');
    list.querySelectorAll('[data-advance]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await DB.setRequestStatus(btn.dataset.advance, btn.dataset.to);
          toast(t('toastStatusUpdated', statusLabel(btn.dataset.to)), 'success');
          loadRequests();
        } catch (err) {
          toast(err.message || 'Could not update request', 'error');
        }
      });
    });
  } catch (err) {
    list.innerHTML = '';
    toast(err.message || 'Could not load requests', 'error');
  }
}

function statusChipClass(status) {
  if (status === 'fulfilled') return 'chip-ok';
  if (status === 'cancelled') return 'chip-neutral';
  return 'chip-low';
}
function nextStatusButton(r) {
  const next = { pending: 'preparing', preparing: 'ready' }[r.status];
  if (!next) return '';
  return `<button class="btn btn-outline btn-sm" data-advance="${r.id}" data-to="${next}">${t('btnMarkStatus', statusLabel(next))}</button>`;
}

document.getElementById('btn-new-request').addEventListener('click', openNewRequestSheet);

function openNewRequestSheet() {
  Sheet.open(t('newRequestTitle'), `
    <div id="nr-error"></div>
    <form id="form-new-request">
      <div class="field">
        <label for="nr-requester">${t('fieldRequesterName')}</label>
        <input type="text" id="nr-requester" required>
      </div>
      <div class="field">
        <label for="nr-sku">${t('fieldItem')}</label>
        <select id="nr-sku" required>${activeSkusOptionsCache()}</select>
      </div>
      <div class="field-row">
        <div class="field">
          <label for="nr-qty">${t('fieldQty')}</label>
          <input type="number" id="nr-qty" min="0.0001" step="any" required>
        </div>
        <div class="field">
          <label for="nr-needed">${t('fieldNeededBy')}</label>
          <input type="date" id="nr-needed">
        </div>
      </div>
      <div class="field">
        <label for="nr-notes">${t('fieldNotesOptional')}</label>
        <textarea id="nr-notes"></textarea>
      </div>
      <button class="btn btn-primary btn-block" type="submit">${t('btnSubmitRequest')}</button>
    </form>
  `);
  document.getElementById('form-new-request').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('nr-error');
    errEl.innerHTML = '';
    try {
      await DB.createRequest({
        requesterName: document.getElementById('nr-requester').value.trim(),
        skuId: document.getElementById('nr-sku').value,
        qty: parseFloat(document.getElementById('nr-qty').value),
        neededBy: document.getElementById('nr-needed').value,
        notes: document.getElementById('nr-notes').value.trim(),
      });
      Sheet.close();
      toast(t('toastRequestSubmitted'), 'success');
      loadRequests();
    } catch (err) {
      errEl.innerHTML = `<div class="form-error">${escapeHtml(err.message || 'Could not submit request')}</div>`;
    }
  });
}

function activeSkusOptionsCache() {
  return activeSkus.map((s) => `<option value="${s.id}">${escapeHtml(s.sku_code)} — ${escapeHtml(s.name)}</option>`).join('');
}

// ============================================================================
// REPORTS
// ============================================================================
let currentReport = 'stock';

document.querySelectorAll('#report-tabs button').forEach((b) => {
  b.addEventListener('click', () => {
    document.querySelectorAll('#report-tabs button').forEach((x) => x.setAttribute('aria-pressed', x === b));
    currentReport = b.dataset.report;
    loadReport(currentReport);
  });
});

async function loadReport(kind) {
  const body = document.getElementById('report-body');
  body.innerHTML = `<div class="card"><div class="skeleton" style="height:160px"></div></div>`;
  try {
    if (kind === 'stock') {
      const rows = await DB.stockBySku();
      body.innerHTML = tableHtml(
        [t('colSku'), t('colName'), t('colCategory'), t('colOnHand'), t('colThreshold'), t('colStatus')],
        rows.map((r) => [r.sku_code, r.name, r.category,
          `<span class="num">${fmtQty(r.on_hand)} ${r.base_uom}</span>`,
          `<span class="num">${fmtQty(r.min_threshold)}</span>`,
          r.is_low ? `<span class="chip chip-low">${t('rowLow')}</span>` : `<span class="chip chip-ok">${t('chipOk')}</span>`]),
      );
    } else if (kind === 'movement') {
      const rows = await DB.movementHistory();
      body.innerHTML = tableHtml(
        [t('colWhen'), t('colType'), t('colSku'), t('colLot'), t('colQty'), t('colBy'), t('colRequest')],
        rows.map((r) => [fmtDateTime(r.created_at), r.type, `${r.sku_code} — ${r.sku_name}`, r.lot_code,
          `<span class="num">${fmtQty(r.qty)} ${r.uom}</span>`, r.performed_by || '—', r.request_code || '—']),
      );
    } else if (kind === 'discrepancy') {
      const rows = await DB.discrepancyReport();
      if (!rows.length) { body.innerHTML = `<div class="empty"><p>${t('emptyDiscrepancies')}</p></div>`; return; }
      body.innerHTML = tableHtml(
        [t('colWhen'), t('colRequest'), t('colSku'), t('colLot'), t('colRequested'), t('colActual'), t('colVariance')],
        rows.map((r) => [fmtDateTime(r.created_at), `${r.request_code} (${r.requester_name})`, `${r.sku_code} — ${r.sku_name}`, r.lot_code,
          `<span class="num">${fmtQty(r.requested_qty)}</span>`, `<span class="num">${fmtQty(r.actual_qty)}</span>`,
          `<span class="num" style="color:var(--discrepancy)">${r.variance > 0 ? '+' : ''}${fmtQty(r.variance)}</span>`]),
      );
    } else if (kind === 'lowstock') {
      const rows = await DB.lowStock();
      if (!rows.length) { body.innerHTML = `<div class="empty"><p>${t('emptyLowStock')}</p></div>`; return; }
      body.innerHTML = tableHtml(
        [t('colSku'), t('colName'), t('colCategory'), t('colOnHand'), t('colThreshold')],
        rows.map((r) => [r.sku_code, r.name, r.category, `<span class="num">${fmtQty(r.on_hand)} ${r.base_uom}</span>`, `<span class="num">${fmtQty(r.min_threshold)}</span>`]),
      );
    }
  } catch (err) {
    body.innerHTML = '';
    toast(err.message || 'Could not load report', 'error');
  }
}

function tableHtml(headers, rows) {
  if (!rows.length) return `<div class="empty"><p>${t('emptyGeneric')}</p></div>`;
  return `<div class="table-scroll"><table>
    <thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>
  </table></div>`;
}

// ---- Boot ------------------------------------------------------------------------
(async function init() {
  document.documentElement.lang = I18n.current;
  I18n.applyStatic();
  try {
    activeSkus = await DB.listSkus({ activeOnly: true });
  } catch (_) { /* stock view will surface the error */ }
  showView('stock');
})();
