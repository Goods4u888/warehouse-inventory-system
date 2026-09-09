// ============================================================================
// View router + UI wiring. DB.* does all data access, QR.* does codes/camera,
// I18n/t() does display strings.
// ============================================================================

const CATS = {
  Cement: 'cement', Steel: 'steel', Aggregate: 'aggregate',
  'Pipe & Fittings': 'hardware', Hardware: 'hardware',
  Electrical: 'electrical', 'Sanitary Ware': 'sanitary', Paint: 'paint',
  Lumber: 'lumber', 'Cleaning Supplies': 'cleaning',
  Flooring: 'flooring', Ceiling: 'ceiling', Furniture: 'furniture', 'Curtains & Blinds': 'curtains',
};
function catClass(category) {
  return CATS[category] || 'other';
}

// category is stored (and matched against skus.category / the "add
// category" flow) as the English name seeded in schema.sql/the mockup
// seeds — this only changes how it's *displayed* in Thai, same pattern as
// every other t()-driven label. A category a staff member typed by hand
// (via the "+" add-category button) has no entry here and just falls back
// to whatever they typed, which is normal since that's already Thai text.
const CATEGORY_LABELS_TH = {
  Cement: 'ปูนซีเมนต์', Steel: 'เหล็ก', Aggregate: 'หินและทราย',
  'Pipe & Fittings': 'ท่อและอุปกรณ์ประปา', Hardware: 'ฮาร์ดแวร์',
  Electrical: 'ไฟฟ้า', 'Sanitary Ware': 'สุขภัณฑ์', Paint: 'สีและอุปกรณ์ทาสี',
  Lumber: 'ไม้และวัสดุแผ่น', 'Cleaning Supplies': 'อุปกรณ์ทำความสะอาด',
  Flooring: 'พื้นและวัสดุปูพื้น', Ceiling: 'ฝ้าเพดาน', Furniture: 'เฟอร์นิเจอร์',
  'Curtains & Blinds': 'ผ้าม่านและมู่ลี่',
};
function catLabel(category) {
  return I18n.current === 'th' ? (CATEGORY_LABELS_TH[category] || category) : category;
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
const STATUS_ICONS = {
  all: 'list', pending: 'clock', preparing: 'package', ready: 'checkCircle', fulfilled: 'checkSquare',
};

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
  else if (currentView === 'receive') { loadReceiveForm(); loadReturnForm(); updateReceiveSectionTitle(); }
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
  if (name === 'receive') { loadReceiveForm(); loadReturnForm(); }
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
let stockSearch = '';

document.getElementById('stock-search').addEventListener('input', (e) => {
  stockSearch = e.target.value;
  renderStock();
});

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
    <button class="facet" data-cat="${escapeHtml(c)}" aria-pressed="${c === stockFacet}">${icon(c === 'all' ? 'list' : catIcon(c), 14)}<span>${c === 'all' ? t('facetAll') : escapeHtml(catLabel(c))}</span></button>
  `).join('');
  el.querySelectorAll('.facet').forEach((btn) => {
    btn.addEventListener('click', () => { stockFacet = btn.dataset.cat; renderStockFacets(); renderStock(); });
  });
}

function renderStock() {
  let rows = stockFacet === 'all' ? stockRows : stockRows.filter((r) => r.category === stockFacet);
  const q = stockSearch.trim().toLowerCase();
  if (q) {
    rows = rows.filter((r) => r.sku_code.toLowerCase().includes(q) || r.name.toLowerCase().includes(q));
  }
  document.getElementById('stock-total').textContent = stockRows.length;
  document.getElementById('stock-low-count').textContent = stockRows.filter((r) => r.is_low).length;

  const list = document.getElementById('stock-list');
  if (!rows.length) {
    list.innerHTML = `<div class="empty"><p>${q ? t('emptySearchResults', escapeHtml(stockSearch.trim())) : t('emptyStockCategory')}</p></div>`;
    return;
  }
  list.innerHTML = rows.map((r) => `
    <div class="card card-clickable" data-sku-id="${r.sku_id}" role="button" tabindex="0">
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
        <span class="chip chip-cat-${catClass(r.category)}">${icon(catIcon(r.category), 12)}${escapeHtml(catLabel(r.category))}</span>
        ${r.is_low
          ? `<span class="chip chip-low"><span class="dot"></span>${t('chipBelowThreshold', fmtQty(r.min_threshold))}</span>`
          : `<span class="chip chip-ok"><span class="dot"></span>${t('chipOk')}</span>`}
      </div>
    </div>
  `).join('');
}

// Tapping a Stock card opens its item detail sheet — event delegation since
// the list is fully re-rendered on every search/facet/refresh.
document.getElementById('stock-list').addEventListener('click', (e) => {
  const card = e.target.closest('[data-sku-id]');
  if (!card) return;
  const row = stockRows.find((r) => r.sku_id === card.dataset.skuId);
  if (row) openItemDetailSheet(row);
});
document.getElementById('stock-list').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const card = e.target.closest('[data-sku-id]');
  if (!card) return;
  e.preventDefault();
  const row = stockRows.find((r) => r.sku_id === card.dataset.skuId);
  if (row) openItemDetailSheet(row);
});

document.getElementById('btn-scan-shortcut').addEventListener('click', () => showView('issue'));

// ---- Item detail (Stock -> tap a card) ---------------------------------------
// A read-only summary of one item — on-hand/threshold/status plus its most
// recent movements (js/db.js: movementHistoryForSku) — with shortcuts into
// the same Issue/Receive/Print actions available elsewhere, so a card tap
// covers "what is this, how much do we have, what happened to it lately" in
// one place instead of needing Reports/Scan/Manage items separately.
function openItemDetailSheet(row) {
  Sheet.open(t('itemDetailTitle'), `
    <div class="card-row" style="align-items:flex-start">
      <div>
        <div class="card-title" style="font-size:var(--t-sec)">${escapeHtml(row.name)}</div>
        <div class="card-meta mono">${escapeHtml(row.sku_code)}</div>
      </div>
      <span class="chip chip-cat-${catClass(row.category)}">${icon(catIcon(row.category), 12)}${escapeHtml(catLabel(row.category))}</span>
    </div>

    <div class="card-row" style="margin-top:var(--s5)">
      <div>
        <div class="stat-label">${t('onHandLabel')}</div>
        <div class="stat-figure">${fmtQty(row.on_hand)}<span style="font-size:var(--t-micro);color:var(--ink-3)"> ${escapeHtml(row.base_uom)}</span></div>
      </div>
      ${row.is_low
        ? `<span class="chip chip-low"><span class="dot"></span>${t('chipBelowThreshold', fmtQty(row.min_threshold))}</span>`
        : `<span class="chip chip-ok"><span class="dot"></span>${t('chipOk')}</span>`}
    </div>
    <div class="field-hint">${t('itemDetailThresholdHint', fmtQty(row.min_threshold), escapeHtml(row.base_uom))}</div>

    <div class="section-head"><h2>${t('itemDetailRecentActivity')}</h2></div>
    <div id="idet-movements">${skeletonCards(2)}</div>

    <div class="idet-actions">
      <button class="btn btn-primary" id="idet-btn-issue" data-icon="check"><span>${t('scanActionIssue')}</span></button>
      <button class="btn btn-outline" id="idet-btn-receive" data-icon="package"><span>${t('scanActionReceive')}</span></button>
    </div>
    <button class="btn btn-outline btn-block" style="margin-top:var(--s2)" id="idet-btn-print">${icon('printer', 16)}<span>${t('btnPrintSticker')}</span></button>
  `);
  applyStaticIcons();

  document.getElementById('idet-btn-issue').addEventListener('click', () => {
    Sheet.close();
    showView('issue');
    onItemScanned(row.sku_code, 'issue');
  });
  document.getElementById('idet-btn-receive').addEventListener('click', () => {
    Sheet.close();
    showView('issue');
    onItemScanned(row.sku_code, 'receive');
  });
  document.getElementById('idet-btn-print').addEventListener('click', () => {
    printSkuSticker({ sku_code: row.sku_code, name: row.name });
  });

  loadItemDetailMovements(row.sku_code);
}

async function loadItemDetailMovements(skuCode) {
  const box = document.getElementById('idet-movements');
  if (!box) return;
  try {
    const rows = await DB.movementHistoryForSku(skuCode, 5);
    if (!box.isConnected) return; // sheet closed while this was in flight
    if (!rows.length) {
      box.innerHTML = `<div class="empty"><p>${t('itemDetailNoActivity')}</p></div>`;
      return;
    }
    const typeLabel = { receive: t('mvReceive'), issue: t('mvIssue'), return: t('mvReturn') };
    const sign = { receive: '+', issue: '−', return: '+' };
    const qtyClass = { receive: 'pos', issue: 'neg', return: 'pos' };
    box.innerHTML = `<div class="idet-move-list">${rows.map((m) => `
      <div class="idet-move-row">
        <div class="idet-move-row-text">
          <span class="card-title" style="font-size:var(--t-meta)">${escapeHtml(typeLabel[m.type] || m.type)}</span>
          <span class="card-meta">${fmtDate(m.created_at)}${m.performed_by ? ` · ${escapeHtml(m.performed_by)}` : ''}</span>
        </div>
        <span class="idet-move-qty ${qtyClass[m.type] || ''}">${sign[m.type] || ''}${fmtQty(m.qty)} ${escapeHtml(m.uom)}</span>
      </div>
    `).join('')}</div>`;
  } catch (err) {
    if (box.isConnected) box.innerHTML = '';
  }
}

function skeletonCards(n) {
  return Array.from({ length: n }).map(() => `<div class="card"><div class="skeleton" style="height:52px"></div></div>`).join('');
}

// ============================================================================
// MANAGE ITEMS (SKU master-data CRUD)
// ============================================================================
let miAllSkus = [];
let miEditingId = null;
let miCategories = [];
// IDs checked via the Manage Items checkboxes, for the bulk "print selected"
// A4 sticker sheet. Reset each time the sheet is (re)opened — selection
// isn't meant to persist across separate visits to Manage Items.
let miSelectedIds = new Set();

document.getElementById('btn-manage-items').addEventListener('click', openManageItemsSheet);

async function refreshSkuCaches() {
  try {
    activeSkus = await DB.listSkus({ activeOnly: true });
  } catch (_) { /* ignore — next view load will surface any real error */ }
  if (currentView === 'stock') loadStock();
}

function openManageItemsSheet() {
  miSelectedIds = new Set();
  Sheet.open(t('manageItemsTitle'), manageItemsSheetHtml());
  wireManageItemsForm();
  loadManageItemsCategories();
  loadManageItemsList();
}

async function loadManageItemsCategories() {
  try {
    miCategories = await DB.listCategories();
    renderCategoryOptions();
  } catch (err) {
    toast(err.message || 'Could not load categories', 'error');
  }
}

function renderCategoryOptions(selected = '') {
  const sel = document.getElementById('mi-category');
  if (!sel) return;
  const current = selected || sel.value;
  sel.innerHTML = `
    <option value="" disabled ${current ? '' : 'selected'}>${t('selectCategoryPlaceholder')}</option>
    ${miCategories.map((c) => `<option value="${escapeHtml(c.name)}" ${c.name === current ? 'selected' : ''}>${escapeHtml(catLabel(c.name))}</option>`).join('')}
  `;
}

function miSubmitButtonInner(mode) {
  return mode === 'edit'
    ? `${icon('checkCircle', 16)}<span>${t('saveChanges')}</span>`
    : `${icon('plusCircle', 16)}<span>${t('addItem')}</span>`;
}

function manageItemsSheetHtml() {
  return `
    <div id="mi-error"></div>
    <form id="form-manage-item">
      <div class="field-row">
        <div class="field">
          <label for="mi-sku-code">${t('fieldSkuCode')}</label>
          <input type="text" id="mi-sku-code" disabled placeholder="${t('skuCodeAutoPlaceholder')}">
        </div>
        <div class="field">
          <label for="mi-category">${t('fieldCategory')}</label>
          <div class="field-with-btn">
            <select id="mi-category" required></select>
            <button type="button" class="btn-icon-add" id="mi-category-add-btn" title="${t('addCategoryTitle')}" aria-label="${t('addCategoryTitle')}">${icon('plusCircle', 18)}</button>
          </div>
          <div class="new-category-row" id="mi-category-new-row" hidden>
            <input type="text" id="mi-category-new-input" placeholder="${t('newCategoryPlaceholder')}">
            <button type="button" class="btn btn-outline btn-sm" id="mi-category-new-confirm">${icon('check', 14)}<span>${t('add')}</span></button>
            <button type="button" class="btn btn-ghost btn-sm" id="mi-category-new-cancel">${icon('xCircle', 14)}</button>
          </div>
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
        <button type="button" class="btn btn-ghost" id="mi-cancel-edit" hidden>${icon('xCircle', 16)}<span>${t('cancel')}</span></button>
        <button type="submit" class="btn btn-primary btn-block" id="mi-submit">${miSubmitButtonInner('add')}</button>
      </div>
    </form>

    <div class="mi-bulk-bar">
      <label class="mi-check mi-select-all">
        <input type="checkbox" id="mi-select-all">
        <span>${t('selectAll')}</span>
      </label>
      <button type="button" class="btn btn-primary btn-sm" id="mi-print-selected" disabled>${icon('printer', 14)}<span id="mi-print-selected-label">${t('btnPrintSelected')}</span></button>
    </div>

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
    document.getElementById('mi-sku-code').value = '';
    renderCategoryOptions();
    document.getElementById('mi-submit').innerHTML = miSubmitButtonInner('add');
    document.getElementById('mi-cancel-edit').hidden = true;
  });

  const addBtn = document.getElementById('mi-category-add-btn');
  const newRow = document.getElementById('mi-category-new-row');
  const newInput = document.getElementById('mi-category-new-input');
  addBtn.addEventListener('click', () => {
    newRow.hidden = !newRow.hidden;
    if (!newRow.hidden) newInput.focus();
  });
  document.getElementById('mi-category-new-cancel').addEventListener('click', () => {
    newInput.value = '';
    newRow.hidden = true;
  });
  document.getElementById('mi-category-new-confirm').addEventListener('click', () => onAddCategory(newInput, newRow));
  newInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); onAddCategory(newInput, newRow); }
  });

  // Bulk-print toolbar lives outside the two list containers that
  // renderManageItemsLists() rewrites, so it's wired once here rather than
  // on every render (unlike the per-row checkboxes, which are re-bound each
  // time since renderManageItemsLists() recreates those elements).
  document.getElementById('mi-select-all').addEventListener('change', (e) => {
    if (e.target.checked) {
      miAllSkus.forEach((s) => miSelectedIds.add(s.id));
    } else {
      miSelectedIds.clear();
    }
    renderManageItemsLists();
  });
  document.getElementById('mi-print-selected').addEventListener('click', printSelectedStickers);
}

async function onAddCategory(newInput, newRow) {
  const name = newInput.value.trim();
  const errEl = document.getElementById('mi-error');
  errEl.innerHTML = '';
  if (!name) return;
  try {
    await DB.createCategory(name);
    miCategories = await DB.listCategories();
    renderCategoryOptions(name);
    newInput.value = '';
    newRow.hidden = true;
    toast(t('toastCategoryCreated'), 'success');
  } catch (err) {
    const msg = /duplicate|unique/i.test(err.message || '') ? t('errorCategoryExists') : (err.message || 'Could not add category');
    errEl.innerHTML = `<div class="form-error">${escapeHtml(msg)}</div>`;
  }
}

async function onManageItemSubmit(e) {
  e.preventDefault();
  const errEl = document.getElementById('mi-error');
  errEl.innerHTML = '';
  const patch = {
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
    document.getElementById('mi-sku-code').value = '';
    renderCategoryOptions();
    document.getElementById('mi-submit').innerHTML = miSubmitButtonInner('add');
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
  // Drop any selected id that no longer exists (e.g. after a reload) so the
  // toolbar's count/checkbox state never drifts from what's actually there.
  const liveIds = new Set(miAllSkus.map((s) => s.id));
  miSelectedIds.forEach((id) => { if (!liveIds.has(id)) miSelectedIds.delete(id); });

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
  document.querySelectorAll('[data-mi-print]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const sku = miAllSkus.find((s) => s.id === btn.dataset.miPrint);
      if (sku) printSkuSticker(sku);
    });
  });
  document.querySelectorAll('[data-mi-select]').forEach((cb) => {
    cb.addEventListener('change', () => {
      if (cb.checked) miSelectedIds.add(cb.dataset.miSelect);
      else miSelectedIds.delete(cb.dataset.miSelect);
      updateBulkPrintToolbar();
    });
  });
  updateBulkPrintToolbar();
}

// Keeps the "select all" checkbox and "Print selected" button in sync with
// miSelectedIds — called after every list render and every checkbox change,
// since the count/enabled-state can't just be computed once.
function updateBulkPrintToolbar() {
  const selectAll = document.getElementById('mi-select-all');
  const printBtn = document.getElementById('mi-print-selected');
  const label = document.getElementById('mi-print-selected-label');
  if (!selectAll || !printBtn || !label) return;
  const count = miSelectedIds.size;
  selectAll.checked = miAllSkus.length > 0 && count === miAllSkus.length;
  printBtn.disabled = count === 0;
  label.textContent = count > 0 ? `${t('btnPrintSelected')} · ${t('selectedCount', count)}` : t('btnPrintSelected');
}

function miRowHtml(s) {
  const checked = miSelectedIds.has(s.id) ? 'checked' : '';
  return `
    <div class="card">
      <div class="card-row mi-row-head">
        <label class="mi-check">
          <input type="checkbox" data-mi-select="${s.id}" ${checked} aria-label="${t('selectAll')}">
        </label>
        <div>
          <div class="card-title">${escapeHtml(s.name)}</div>
          <div class="card-meta mono">${escapeHtml(s.sku_code)} · ${escapeHtml(s.base_uom)}</div>
        </div>
      </div>
      <div class="card-row" style="margin-top:var(--s3)">
        <span class="chip chip-cat-${catClass(s.category)}">${icon(catIcon(s.category), 12)}${escapeHtml(catLabel(s.category))}</span>
      </div>
      <div class="card-row" style="margin-top:var(--s3)">
        <button class="btn btn-outline btn-sm" data-mi-edit="${s.id}">${icon('pencil', 14)}<span>${t('btnEdit')}</span></button>
        <button class="btn btn-outline btn-sm" data-mi-print="${s.id}">${icon('printer', 14)}<span>${t('btnPrintSticker')}</span></button>
        ${s.is_active
          ? `<button class="btn btn-ghost btn-sm" data-mi-toggle="${s.id}" data-to-active="false">${icon('xCircle', 14)}<span>${t('btnDeactivate')}</span></button>`
          : `<button class="btn btn-ghost btn-sm" data-mi-toggle="${s.id}" data-to-active="true">${icon('checkCircle', 14)}<span>${t('btnActivate')}</span></button>`}
      </div>
    </div>
  `;
}

// A single item's sticker is never printed just once: physically you need
// one for the shelf/bin plus spares (a worn sticker, a second bin holding
// the same item, etc.), so every "print sticker" action for one item
// prints a full A4 sheet of repeated copies instead of a lone sticker.
// Reuses the same grid layout as the bulk "Print selected" action below
// (.print-sticker-grid in app.css) — just every cell is the same item.
// idPrefix must be unique per caller (Manage Items / Receive / Return all
// call this) so their copies' QR container ids never collide if two of
// these somehow render back to back.
const STICKERS_PER_SHEET = 20;
function printStickerSheet(sku, idPrefix) {
  const box = document.getElementById('admin-print-sheet');
  const copies = Array.from({ length: STICKERS_PER_SHEET }, (_, i) => i);
  box.innerHTML = copies
    .map((i) => QR.stickerHtml({ skuCode: sku.sku_code, skuName: sku.name, idPrefix: `${idPrefix}${i}-` }))
    .join('');
  copies.forEach((i) => QR.renderInto(document.getElementById(`${idPrefix}${i}-${sku.sku_code}`), sku.sku_code, 120));
  window.print();
}

// Print an item's permanent sticker on demand from Manage Items — not tied
// to a receive/return event.
function printSkuSticker(sku) {
  printStickerSheet(sku, 'mi-sticker-qr-');
}

// Bulk version: every checked Manage Items row, one sticker each, laid out
// as a grid of individually-cuttable stickers on plain A4 paper (no
// specific label-sheet brand/alignment to match — see .print-sticker-grid
// in app.css).
function printSelectedStickers() {
  const items = miAllSkus.filter((s) => miSelectedIds.has(s.id));
  if (!items.length) {
    toast(t('toastNoItemsSelected'), 'error');
    return;
  }
  const box = document.getElementById('admin-print-sheet');
  box.innerHTML = items.map((s) => QR.stickerHtml({ skuCode: s.sku_code, skuName: s.name, idPrefix: 'mi-bulk-qr-' })).join('');
  items.forEach((s) => QR.renderInto(document.getElementById(`mi-bulk-qr-${s.sku_code}`), s.sku_code, 120));
  window.print();
}

function startEditSku(id) {
  const sku = miAllSkus.find((s) => s.id === id);
  if (!sku) return;
  miEditingId = id;
  document.getElementById('mi-sku-code').value = sku.sku_code;
  document.getElementById('mi-name').value = sku.name;
  renderCategoryOptions(sku.category);
  document.getElementById('mi-base-uom').value = sku.base_uom;
  document.getElementById('mi-alt-uom').value = sku.alt_uom || '';
  document.getElementById('mi-conversion-factor').value = sku.conversion_factor ?? '';
  document.getElementById('mi-min-threshold').value = sku.min_threshold;
  document.getElementById('mi-submit').innerHTML = miSubmitButtonInner('edit');
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

// Split from loadReceiveForm() on purpose: this only refreshes the SKU
// dropdown, without touching #receive-result. loadReceiveForm() (below)
// additionally clears the result/error boxes, which is right when entering
// the tab or switching language, but would be wrong right after a
// successful submit — it would wipe the sticker that submit just rendered,
// in the same tick, before it's ever seen. The submit handler calls this
// function instead of loadReceiveForm() for that reason.
async function refreshReceiveSkuOptions() {
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

function loadReceiveForm() {
  document.getElementById('receive-result').innerHTML = '';
  document.getElementById('receive-error').innerHTML = '';
  refreshReceiveSkuOptions();
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
  const label = document.getElementById('rc-submit-label');
  btn.disabled = true; label.textContent = t('btnGenerating');
  try {
    const sku = await DB.receiveStock({ skuId, qty, uom, receivedBy, supplierRef });
    renderReceiveResult(sku, qty, uom);
    e.target.reset();
    refreshReceiveSkuOptions();
    toast(t('toastStockReceived', fmtQty(qty), escapeHtml(uom), escapeHtml(sku.sku_code)), 'success');
  } catch (err) {
    errEl.innerHTML = `<div class="form-error">${escapeHtml(err.message || 'Could not receive stock')}</div>`;
  } finally {
    btn.disabled = false; label.textContent = t('btnGenerateLot');
  }
});

// sku here is the *updated* row receive_stock() returned (qty_on_hand
// already includes this delivery) — qty/uom are this specific delivery's
// amount, shown as a confirmation line above the item's one permanent
// sticker (which itself carries no quantity — see qr.js).
function renderReceiveResult(sku, qty, uom) {
  const box = document.getElementById('receive-result');
  box.innerHTML = `
    <div class="card">
      <div class="eyebrow">${t('stickerReady')}</div>
      <p class="field-hint">${t('receiveConfirmLine', fmtQty(qty), escapeHtml(uom), fmtQty(sku.qty_on_hand))}</p>
      ${QR.stickerHtml({ skuCode: sku.sku_code, skuName: sku.name })}
      <button class="btn btn-outline btn-block" style="margin-top:var(--s4)" id="btn-print-sticker">${icon('printer', 16)}<span>${t('btnPrintSticker')}</span></button>
    </div>`;
  QR.renderInto(document.getElementById(`sticker-qr-${sku.sku_code}`), sku.sku_code, 120);
  document.getElementById('btn-print-sticker').addEventListener('click', () => printStickerSheet(sku, 'rc-sticker-qr-'));
}

// ---- Receive / Return mode toggle -------------------------------------------
document.querySelectorAll('#receive-mode-tabs button').forEach((b) => {
  b.addEventListener('click', () => {
    document.querySelectorAll('#receive-mode-tabs button').forEach((x) => x.setAttribute('aria-pressed', x === b));
    const mode = b.dataset.mode;
    document.getElementById('receive-mode-receive').hidden = mode !== 'receive';
    document.getElementById('receive-mode-return').hidden = mode !== 'return';
    updateReceiveSectionTitle();
  });
});
function currentReceiveMode() {
  const pressed = document.querySelector('#receive-mode-tabs button[aria-pressed="true"]');
  return pressed ? pressed.dataset.mode : 'receive';
}
function updateReceiveSectionTitle() {
  document.getElementById('receive-section-title').textContent =
    currentReceiveMode() === 'return' ? t('returnTitle') : t('receiveTitle');
}

// ============================================================================
// RETURN (materials coming back into stock — adds to the item's running
// total, same as receiving)
// ============================================================================
let returnActiveSkus = [];

// Same split as refreshReceiveSkuOptions()/loadReceiveForm() above, for the
// same reason: don't let a post-submit refresh wipe the sticker that submit
// just rendered into #return-result.
async function refreshReturnSkuOptions() {
  try {
    returnActiveSkus = await DB.listSkus({ activeOnly: true });
    const sel = document.getElementById('rt-sku');
    sel.innerHTML = returnActiveSkus.map((s) => `<option value="${s.id}" data-uom="${escapeHtml(s.base_uom)}">${escapeHtml(s.sku_code)} — ${escapeHtml(s.name)}</option>`).join('');
    if (returnActiveSkus.length) document.getElementById('rt-uom').value = returnActiveSkus[0].base_uom;
    sel.onchange = () => {
      const opt = sel.options[sel.selectedIndex];
      document.getElementById('rt-uom').value = opt.dataset.uom;
    };
  } catch (err) {
    toast(err.message || 'Could not load items', 'error');
  }
}

function loadReturnForm() {
  document.getElementById('return-result').innerHTML = '';
  document.getElementById('return-error').innerHTML = '';
  refreshReturnSkuOptions();
}

document.getElementById('form-return').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = document.getElementById('return-error');
  errEl.innerHTML = '';
  const skuId = document.getElementById('rt-sku').value;
  const qty = parseFloat(document.getElementById('rt-qty').value);
  const uom = document.getElementById('rt-uom').value.trim();
  const note = document.getElementById('rt-note').value.trim();
  const returnedBy = document.getElementById('rt-by').value.trim();

  const btn = e.target.querySelector('button[type="submit"]');
  const label = document.getElementById('rt-submit-label');
  btn.disabled = true; label.textContent = t('btnGenerating');
  try {
    const sku = await DB.returnStock({ skuId, qty, uom, returnedBy, note });
    renderReturnResult(sku, qty, uom);
    e.target.reset();
    refreshReturnSkuOptions();
    toast(t('toastStockReturned', fmtQty(qty), escapeHtml(uom), escapeHtml(sku.sku_code)), 'success');
  } catch (err) {
    errEl.innerHTML = `<div class="form-error">${escapeHtml(err.message || 'Could not record return')}</div>`;
  } finally {
    btn.disabled = false; label.textContent = t('btnGenerateReturnLot');
  }
});

function renderReturnResult(sku, qty, uom) {
  const box = document.getElementById('return-result');
  box.innerHTML = `
    <div class="card">
      <div class="eyebrow">${t('stickerReady')}</div>
      <p class="field-hint">${t('returnConfirmLine', fmtQty(qty), escapeHtml(uom), fmtQty(sku.qty_on_hand))}</p>
      ${QR.stickerHtml({ skuCode: sku.sku_code, skuName: sku.name })}
      <button class="btn btn-outline btn-block" style="margin-top:var(--s4)" id="btn-print-return-sticker">${icon('printer', 16)}<span>${t('btnPrintSticker')}</span></button>
    </div>`;
  QR.renderInto(document.getElementById(`sticker-qr-${sku.sku_code}`), sku.sku_code, 120);
  document.getElementById('btn-print-return-sticker').addEventListener('click', () => printStickerSheet(sku, 'rt-sticker-qr-'));
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
  QR.startScanner(video, canvas, onItemScanned, (err) => {
    status.textContent = t('scanHintNoCamera');
  }, () => {
    status.textContent = t('scanHintNotRecognized');
  });
}

document.getElementById('btn-lookup-lot').addEventListener('click', () => {
  const code = document.getElementById('scan-manual').value.trim();
  if (code) onItemScanned(code);
});

async function onItemScanned(code, preferredAction = null) {
  QR.stopScanner(document.getElementById('scan-video'));
  document.getElementById('scan-status').textContent = t('scanLookingUp', code);
  try {
    const sku = await DB.findSkuByCode(code);
    if (!sku) {
      toast(t('toastItemNotFound', code), 'error');
      resetScanView();
      return;
    }
    const openRequests = await DB.listRequests({});
    const forThisSku = openRequests.filter((r) => r.sku_id === sku.sku_id && r.status !== 'fulfilled' && r.status !== 'cancelled');
    renderScannedItem(sku, forThisSku, preferredAction);
  } catch (err) {
    toast(err.message || 'Lookup failed', 'error');
    resetScanView();
  }
}

// One permanent sticker per item now covers both directions: issuing
// (deduct, against an open request) and receiving more (add) — this is the
// screen that lets scanning the same code do either. Defaults to the Issue
// tab when there's an open request to fulfill, otherwise to Receive (there's
// nothing to issue against, so that's the useful action).
function renderScannedItem(sku, openRequests, preferredAction = null) {
  document.getElementById('scan-step-camera').hidden = true;
  const box = document.getElementById('scan-step-issue');
  box.hidden = false;
  const defaultAction = preferredAction || (openRequests.length ? 'issue' : 'receive');
  box.innerHTML = `
    <div class="card">
      <div class="eyebrow">${t('itemFound')}</div>
      <div class="card-title">${escapeHtml(sku.name)}</div>
      <div class="card-meta mono">${escapeHtml(sku.sku_code)}</div>
      <div class="card-row" style="margin-top:var(--s3)">
        <span class="chip chip-cat-${catClass(sku.category)}">${icon(catIcon(sku.category), 12)}${escapeHtml(catLabel(sku.category))}</span>
        <span class="stat-figure" style="font-size:var(--t-card)">${t('unitOnHand', fmtQty(sku.on_hand), escapeHtml(sku.base_uom))}</span>
      </div>
    </div>

    <div class="segmented" id="scan-action-tabs" role="tablist" style="margin-top:var(--s5)">
      <button data-action="issue" aria-pressed="${defaultAction === 'issue'}" data-icon="check"><span>${t('scanActionIssue')}</span></button>
      <button data-action="receive" aria-pressed="${defaultAction === 'receive'}" data-icon="package"><span>${t('scanActionReceive')}</span></button>
    </div>

    <div id="scan-action-issue" ${defaultAction === 'issue' ? '' : 'hidden'}>
      ${openRequests.length ? `
        <div class="field" style="margin-top:var(--s4)">
          <label for="issue-request">${t('fieldFulfillWhich')}</label>
          <select id="issue-request">
            ${openRequests.map((r) => `<option value="${r.id}" data-qty="${r.qty_requested}">${escapeHtml(t('optionRequestLine', r.request_code, r.requester_name, fmtQty(r.qty_requested), sku.base_uom))}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label for="issue-qty">${t('fieldActualQty')}</label>
          <input type="number" id="issue-qty" min="0.0001" step="any" max="${sku.on_hand}">
          <div class="field-hint" id="issue-qty-hint"></div>
        </div>
        <div class="field">
          <label for="issue-picked-up-by">${t('fieldPickedUpBy')}</label>
          <input type="text" id="issue-picked-up-by" placeholder="${escapeHtml(t('fieldReceivedByPh'))}">
        </div>
        <div id="issue-error"></div>
        <button class="btn btn-primary btn-block" id="btn-confirm-issue">${icon('check', 16)}<span id="issue-confirm-label">${t('btnConfirmIssue')}</span></button>
      ` : `
        <div class="empty" style="margin-top:var(--s4)">
          <p>${t('emptyNoOpenRequest')}</p>
        </div>
      `}
    </div>

    <div id="scan-action-receive" ${defaultAction === 'receive' ? '' : 'hidden'}>
      <div class="field" style="margin-top:var(--s4)">
        <label for="scan-rc-qty">${t('fieldQtyReceived')}</label>
        <input type="number" id="scan-rc-qty" min="0.0001" step="any" value="1">
      </div>
      <div class="field">
        <label for="scan-rc-uom">${t('fieldUnit')}</label>
        <input type="text" id="scan-rc-uom" value="${escapeHtml(sku.base_uom)}">
      </div>
      <div class="field">
        <label for="scan-rc-by">${t('fieldReceivedBy')}</label>
        <input type="text" id="scan-rc-by" placeholder="${escapeHtml(t('fieldReceivedByPh'))}">
      </div>
      <div id="scan-rc-error"></div>
      <button class="btn btn-primary btn-block" id="btn-confirm-scan-receive">${icon('plusCircle', 16)}<span id="scan-rc-confirm-label">${t('btnConfirmReceive')}</span></button>
    </div>

    <button class="btn btn-ghost btn-block" id="btn-scan-again" style="margin-top:var(--s4)">${icon('repeat', 16)}<span>${t('btnScanDifferent')}</span></button>
  `;

  document.getElementById('btn-scan-again').addEventListener('click', resetScanView);

  document.querySelectorAll('#scan-action-tabs button').forEach((b) => {
    b.addEventListener('click', () => {
      document.querySelectorAll('#scan-action-tabs button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      document.getElementById('scan-action-issue').hidden = b.dataset.action !== 'issue';
      document.getElementById('scan-action-receive').hidden = b.dataset.action !== 'receive';
    });
  });

  const reqSel = document.getElementById('issue-request');
  const qtyInput = document.getElementById('issue-qty');
  if (reqSel) {
    const syncDefault = () => {
      const opt = reqSel.options[reqSel.selectedIndex];
      qtyInput.value = opt.dataset.qty;
      document.getElementById('issue-qty-hint').textContent = t('hintRequested', fmtQty(opt.dataset.qty), sku.base_uom);
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
    const label = document.getElementById('issue-confirm-label');
    btn.disabled = true; label.textContent = t('btnConfirming');
    try {
      const result = await DB.issueStock({ skuId: sku.sku_id, requestId, actualQty, performedBy });
      if (result.has_discrepancy) {
        toast(t('toastIssuedDiscrepancy', fmtQty(requestedQty), fmtQty(actualQty)), 'error');
      } else {
        toast(t('toastIssuedClean'), 'success');
      }
      resetScanView();
    } catch (err) {
      errEl.innerHTML = `<div class="form-error">${escapeHtml(err.message || 'Could not confirm issue')}</div>`;
      btn.disabled = false; label.textContent = t('btnConfirmIssue');
    }
  });

  document.getElementById('btn-confirm-scan-receive')?.addEventListener('click', async () => {
    const errEl = document.getElementById('scan-rc-error');
    errEl.innerHTML = '';
    const qty = parseFloat(document.getElementById('scan-rc-qty').value);
    const uom = document.getElementById('scan-rc-uom').value.trim();
    const receivedBy = document.getElementById('scan-rc-by').value.trim();

    if (!(qty > 0) || !uom) {
      errEl.innerHTML = `<div class="form-error">${escapeHtml(t('fieldRequiredGeneric'))}</div>`;
      return;
    }

    const btn = document.getElementById('btn-confirm-scan-receive');
    const label = document.getElementById('scan-rc-confirm-label');
    btn.disabled = true; label.textContent = t('btnConfirming');
    try {
      const updated = await DB.receiveStock({ skuId: sku.sku_id, qty, uom, receivedBy, supplierRef: null });
      toast(t('toastStockReceived', fmtQty(qty), escapeHtml(uom), escapeHtml(updated.sku_code)), 'success');
      resetScanView();
    } catch (err) {
      errEl.innerHTML = `<div class="form-error">${escapeHtml(err.message || 'Could not receive stock')}</div>`;
      btn.disabled = false; label.textContent = t('btnConfirmReceive');
    }
  });
}

// ============================================================================
// REQUESTS
// ============================================================================
const REQUEST_STATUSES = ['all', 'pending', 'preparing', 'ready', 'fulfilled'];
let requestStatus = 'all';
let requestSearch = '';
let requestRows = [];

function renderRequestTabs() {
  const el = document.getElementById('request-status-tabs');
  el.innerHTML = REQUEST_STATUSES.map((s) => `<button data-status="${s}" aria-pressed="${s === requestStatus}">${icon(STATUS_ICONS[s] || 'list', 15)}<span>${statusLabel(s)}</span></button>`).join('');
  el.querySelectorAll('button').forEach((b) => {
    b.addEventListener('click', () => { requestStatus = b.dataset.status; renderRequestTabs(); loadRequests(); });
  });
}
renderRequestTabs();

document.getElementById('request-search').addEventListener('input', (e) => {
  requestSearch = e.target.value;
  renderRequestsList();
});

async function loadRequests() {
  const list = document.getElementById('requests-list');
  list.innerHTML = skeletonCards(3);
  try {
    requestRows = await DB.listRequests({ status: requestStatus === 'all' ? null : requestStatus });
    renderRequestsList();
  } catch (err) {
    list.innerHTML = '';
    toast(err.message || 'Could not load requests', 'error');
  }
}

function renderRequestsList() {
  const list = document.getElementById('requests-list');
  const q = requestSearch.trim().toLowerCase();
  const rows = q ? requestRows.filter((r) =>
    (r.requester_name || '').toLowerCase().includes(q) ||
    (r.picked_up_by || '').toLowerCase().includes(q) ||
    (r.request_code || '').toLowerCase().includes(q) ||
    (r.department || '').toLowerCase().includes(q) ||
    (r.notes || '').toLowerCase().includes(q) ||
    (r.work_area || '').toLowerCase().includes(q) ||
    (r.skus?.name || '').toLowerCase().includes(q) ||
    (r.skus?.sku_code || '').toLowerCase().includes(q) ||
    (r.created_at || '').slice(0, 10).includes(q) ||
    fmtDate(r.created_at).toLowerCase().includes(q)
  ) : requestRows;

  if (!rows.length) {
    if (q) {
      list.innerHTML = `<div class="empty"><p>${t('emptySearchResults', escapeHtml(requestSearch.trim()))}</p></div>`;
      return;
    }
    list.innerHTML = `<div class="empty"><p>${t('emptyRequests', requestStatus === 'all' ? '' : statusLabel(requestStatus) + ' ')}</p>
      <button class="btn btn-primary btn-sm" id="empty-new-request">${icon('plusCircle', 14)}<span>${t('btnNewRequest')}</span></button></div>`;
    document.getElementById('empty-new-request')?.addEventListener('click', openNewRequestSheet);
    return;
  }
  list.innerHTML = rows.map((r) => {
    const hasItem = !!r.sku_id;
    const title = hasItem ? escapeHtml(r.skus?.name || 'Unknown item') : (r.department ? escapeHtml(r.department) : t('generalRequest'));
    const meta = hasItem
      ? `${escapeHtml(r.requester_name)} · ${fmtQty(r.qty_requested)} ${escapeHtml(r.skus?.base_uom || '')}${r.department ? ' · ' + escapeHtml(r.department) : ''}`
      : escapeHtml(r.requester_name);
    // Internal requests set needed_by; requests submitted through the public
    // form (with or without an item) don't, so fall back to when it came in.
    const whenLine = r.needed_by ? t('neededBy', fmtDate(r.needed_by)) : fmtDateTime(r.created_at);
    return `
    <div class="card">
      <div class="card-row">
        <div>
          <div class="card-title">${title}</div>
          <div class="card-meta">${meta}</div>
        </div>
        <span class="chip ${statusChipClass(r.status)}">${statusLabel(r.status)}</span>
      </div>
      ${r.work_area ? `<div class="card-meta" style="margin-top:var(--s2)">${icon('mapPin', 12)} ${escapeHtml(r.work_area)}</div>` : ''}
      ${r.notes ? `<div class="card-meta" style="margin-top:var(--s2)">${escapeHtml(r.notes)}</div>` : ''}
      <div class="card-row" style="margin-top:var(--s3)">
        <span class="card-meta mono">${escapeHtml(r.request_code)} · ${whenLine}</span>
        ${nextStatusButton(r)}
      </div>
      ${r.status === 'fulfilled' && r.picked_up_by ? `<div class="card-meta" style="margin-top:var(--s2)">${escapeHtml(t('pickedUpBy', r.picked_up_by))}</div>` : ''}
    </div>
  `;
  }).join('');
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
}

function statusChipClass(status) {
  if (status === 'fulfilled') return 'chip-ok';
  if (status === 'cancelled') return 'chip-neutral';
  return 'chip-low';
}
function nextStatusButton(r) {
  const next = { pending: 'preparing', preparing: 'ready' }[r.status];
  if (!next) return '';
  return `<button class="btn btn-outline btn-sm" data-advance="${r.id}" data-to="${next}">${icon('arrowRight', 14)}<span>${t('btnMarkStatus', statusLabel(next))}</span></button>`;
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
      <button class="btn btn-primary btn-block" type="submit">${icon('send', 16)}<span>${t('btnSubmitRequest')}</span></button>
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
let reportSearch = '';
let reportRawRows = [];

document.querySelectorAll('#report-tabs button').forEach((b) => {
  b.addEventListener('click', () => {
    document.querySelectorAll('#report-tabs button').forEach((x) => x.setAttribute('aria-pressed', x === b));
    currentReport = b.dataset.report;
    loadReport(currentReport);
  });
});

document.getElementById('report-search').addEventListener('input', (e) => {
  reportSearch = e.target.value;
  renderReportTable(currentReport);
});

function reportSearchFields(kind) {
  return {
    stock: ['sku_code', 'name', 'category'],
    movement: ['sku_code', 'sku_name', 'performed_by', 'request_code', 'type'],
    discrepancy: ['request_code', 'requester_name', 'sku_code', 'sku_name'],
    lowstock: ['sku_code', 'name', 'category'],
  }[kind] || [];
}

async function loadReport(kind) {
  const body = document.getElementById('report-body');
  body.innerHTML = `<div class="card"><div class="skeleton" style="height:160px"></div></div>`;
  try {
    if (kind === 'stock') reportRawRows = await DB.stockBySku();
    else if (kind === 'movement') reportRawRows = await DB.movementHistory();
    else if (kind === 'requests') reportRawRows = await DB.listRequests();
    else if (kind === 'discrepancy') reportRawRows = await DB.discrepancyReport();
    else if (kind === 'lowstock') reportRawRows = await DB.lowStock();
    renderReportTable(kind);
  } catch (err) {
    body.innerHTML = '';
    toast(err.message || 'Could not load report', 'error');
  }
}

// requests rows are joined (r.skus.name, not a flat sku_name) and need a
// couple of derived fields, so they get their own filter here rather than
// going through the flat-field reportSearchFields() path.
function filterRequestsReport(allRows, q) {
  if (!q) return allRows;
  return allRows.filter((r) =>
    (r.requester_name || '').toLowerCase().includes(q) ||
    (r.department || '').toLowerCase().includes(q) ||
    (r.notes || '').toLowerCase().includes(q) ||
    (r.work_area || '').toLowerCase().includes(q) ||
    (r.request_code || '').toLowerCase().includes(q) ||
    (r.skus?.name || '').toLowerCase().includes(q) ||
    (r.skus?.sku_code || '').toLowerCase().includes(q) ||
    (r.created_at || '').slice(0, 10).includes(q) ||
    fmtDate(r.created_at).toLowerCase().includes(q)
  );
}

function renderReportTable(kind) {
  const body = document.getElementById('report-body');
  const allRows = reportRawRows;
  const q = reportSearch.trim().toLowerCase();
  const fields = reportSearchFields(kind);
  const rows = kind === 'requests'
    ? filterRequestsReport(allRows, q)
    : (q ? allRows.filter((r) => fields.some((f) => String(r[f] ?? '').toLowerCase().includes(q))) : allRows);

  if (q && !rows.length) {
    body.innerHTML = `<div class="empty"><p>${t('emptySearchResults', escapeHtml(reportSearch.trim()))}</p></div>`;
    return;
  }
  if (!allRows.length) {
    if (kind === 'discrepancy') { body.innerHTML = `<div class="empty"><p>${t('emptyDiscrepancies')}</p></div>`; return; }
    if (kind === 'lowstock') { body.innerHTML = `<div class="empty"><p>${t('emptyLowStock')}</p></div>`; return; }
    if (kind === 'requests') { body.innerHTML = `<div class="empty"><p>${t('emptyGeneric')}</p></div>`; return; }
  }

  if (kind === 'stock') {
    body.innerHTML = tableHtml(
      [t('colSku'), t('colName'), t('colCategory'), t('colOnHand'), t('colThreshold'), t('colStatus')],
      rows.map((r) => [r.sku_code, r.name, catLabel(r.category),
        `<span class="num">${fmtQty(r.on_hand)} ${r.base_uom}</span>`,
        `<span class="num">${fmtQty(r.min_threshold)}</span>`,
        r.is_low ? `<span class="chip chip-low">${t('rowLow')}</span>` : `<span class="chip chip-ok">${t('chipOk')}</span>`]),
    );
  } else if (kind === 'movement') {
    body.innerHTML = tableHtml(
      [t('colWhen'), t('colType'), t('colSku'), t('colQty'), t('colBy'), t('colRequest')],
      rows.map((r) => [fmtDateTime(r.created_at), r.type, `${r.sku_code} — ${r.sku_name}`,
        `<span class="num">${fmtQty(r.qty)} ${r.uom}</span>`, r.performed_by || '—', r.request_code || '—']),
    );
  } else if (kind === 'discrepancy') {
    body.innerHTML = tableHtml(
      [t('colWhen'), t('colRequest'), t('colSku'), t('colRequested'), t('colActual'), t('colVariance')],
      rows.map((r) => [fmtDateTime(r.created_at), `${r.request_code} (${r.requester_name})`, `${r.sku_code} — ${r.sku_name}`,
        `<span class="num">${fmtQty(r.requested_qty)}</span>`, `<span class="num">${fmtQty(r.actual_qty)}</span>`,
        `<span class="num" style="color:var(--discrepancy)">${r.variance > 0 ? '+' : ''}${fmtQty(r.variance)}</span>`]),
    );
  } else if (kind === 'lowstock') {
    body.innerHTML = tableHtml(
      [t('colSku'), t('colName'), t('colCategory'), t('colOnHand'), t('colThreshold')],
      rows.map((r) => [r.sku_code, r.name, catLabel(r.category), `<span class="num">${fmtQty(r.on_hand)} ${r.base_uom}</span>`, `<span class="num">${fmtQty(r.min_threshold)}</span>`]),
    );
  } else if (kind === 'requests') {
    body.innerHTML = tableHtml(
      [t('colWhen'), t('colRequest'), t('colRequester'), t('colDepartment'), t('colWorkArea'), t('colItem'), t('colComment'), t('colStatus')],
      rows.map((r) => [
        fmtDateTime(r.created_at), r.request_code, r.requester_name, r.department || t('noDepartment'),
        r.work_area || '—',
        r.skus ? `${r.skus.sku_code} — ${r.skus.name}${r.qty_requested ? ` (${fmtQty(r.qty_requested)} ${r.skus.base_uom || ''})` : ''}` : t('generalRequest'),
        r.notes || '—',
        `<span class="chip ${statusChipClass(r.status)}">${statusLabel(r.status)}</span>`,
      ]),
    );
  }
}

function tableHtml(headers, rows) {
  if (!rows.length) return `<div class="empty"><p>${t('emptyGeneric')}</p></div>`;
  return `<div class="table-scroll"><table>
    <thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>
  </table></div>`;
}

// ============================================================================
// AUTH GATE — admin.html only. Nothing under DB.* will actually return data
// for an unauthenticated caller (Row Level Security enforces that at the
// database itself, see schema.sql), so this gate is about presenting the
// right screen, not the real security boundary.
// ============================================================================
let appBooted = false;

async function initApp() {
  if (appBooted) return;
  appBooted = true;
  try {
    activeSkus = await DB.listSkus({ activeOnly: true });
  } catch (_) { /* stock view will surface the error */ }
  showView('stock');
}

function showLoginScreen() {
  document.getElementById('login-screen').hidden = false;
  document.getElementById('app-shell').hidden = true;
}

function showAppShell() {
  document.getElementById('login-screen').hidden = true;
  document.getElementById('app-shell').hidden = false;
  initApp();
}

async function refreshAuthUi() {
  let session = null;
  try {
    session = await Auth.getSession();
  } catch (_) { /* treat as signed out */ }
  if (session) showAppShell();
  else showLoginScreen();
}

document.getElementById('form-admin-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = document.getElementById('login-error');
  errEl.innerHTML = '';
  const btn = document.getElementById('login-submit');
  const password = document.getElementById('login-password').value;
  btn.disabled = true;
  try {
    await Auth.signIn(password);
    document.getElementById('login-password').value = '';
    await refreshAuthUi();
  } catch (err) {
    errEl.innerHTML = `<div class="form-error">${escapeHtml(t('errorLoginFailed'))}</div>`;
  } finally {
    btn.disabled = false;
  }
});

document.getElementById('btn-logout').addEventListener('click', async () => {
  await Auth.signOut();
  appBooted = false;
  await refreshAuthUi();
});

// ---- Boot ------------------------------------------------------------------------
(async function init() {
  document.documentElement.lang = I18n.current;
  I18n.applyStatic();
  applyStaticIcons();
  await refreshAuthUi();
})();
