// ============================================================================
// View router + UI wiring. DB.* does all data access, QR.* does codes/camera.
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
    <button class="facet" data-cat="${escapeHtml(c)}" aria-pressed="${c === stockFacet}">${c === 'all' ? 'All' : escapeHtml(c)}</button>
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
    list.innerHTML = `<div class="empty"><p>No SKUs in this category yet.</p></div>`;
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
          ? `<span class="chip chip-low"><span class="dot"></span>Below threshold (${fmtQty(r.min_threshold)})</span>`
          : `<span class="chip chip-ok"><span class="dot"></span>OK</span>`}
      </div>
    </div>
  `).join('');
}

function skeletonCards(n) {
  return Array.from({ length: n }).map(() => `<div class="card"><div class="skeleton" style="height:52px"></div></div>`).join('');
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
  btn.disabled = true; btn.textContent = 'Generating…';
  try {
    const lot = await DB.receiveStock({ skuId, qty, uom, receivedBy, supplierRef });
    const sku = activeSkus.find((s) => s.id === skuId);
    renderReceiveResult(lot, sku);
    e.target.reset();
    loadReceiveForm();
    toast(`Lot ${lot.lot_code} received`, 'success');
  } catch (err) {
    errEl.innerHTML = `<div class="form-error">${escapeHtml(err.message || 'Could not receive stock')}</div>`;
  } finally {
    btn.disabled = false; btn.textContent = 'Generate lot & QR';
  }
});

function renderReceiveResult(lot, sku) {
  const box = document.getElementById('receive-result');
  box.innerHTML = `
    <div class="card">
      <div class="eyebrow">Sticker ready to print</div>
      ${QR.stickerHtml({ lotCode: lot.lot_code, skuCode: sku.sku_code, skuName: sku.name, receiveDate: fmtDate(lot.receive_date) })}
      <button class="btn btn-outline btn-block" style="margin-top:var(--s4)" id="btn-print-sticker">Print sticker</button>
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
  status.textContent = "Point the camera at the lot's QR sticker to scan it, or enter the lot code below.";

  const video = document.getElementById('scan-video');
  const canvas = document.getElementById('scan-canvas');
  QR.startScanner(video, canvas, onLotScanned, (err) => {
    status.textContent = 'Camera unavailable — enter the lot code manually below.';
  });
}

document.getElementById('btn-lookup-lot').addEventListener('click', () => {
  const code = document.getElementById('scan-manual').value.trim();
  if (code) onLotScanned(code);
});

async function onLotScanned(lotCode) {
  QR.stopScanner(document.getElementById('scan-video'));
  document.getElementById('scan-status').textContent = `Looking up ${lotCode}…`;
  try {
    const lot = await DB.findLotByCode(lotCode);
    if (!lot) {
      toast(`No lot found for "${lotCode}"`, 'error');
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
      <div class="eyebrow">Lot found</div>
      <div class="card-title">${escapeHtml(lot.name)}</div>
      <div class="card-meta mono">${escapeHtml(lot.lot_code)} · ${escapeHtml(lot.sku_code)}</div>
      <div class="card-row" style="margin-top:var(--s3)">
        <span class="chip chip-cat-${catClass(lot.category)}">${escapeHtml(lot.category)}</span>
        <span class="stat-figure" style="font-size:var(--t-card)">${fmtQty(lot.balance)} ${escapeHtml(lot.uom)} left</span>
      </div>
    </div>

    ${openRequests.length ? `
      <div class="field" style="margin-top:var(--s5)">
        <label for="issue-request">Fulfilling which request?</label>
        <select id="issue-request">
          ${openRequests.map((r) => `<option value="${r.id}" data-qty="${r.qty_requested}">${escapeHtml(r.request_code)} — ${escapeHtml(r.requester_name)}, wants ${fmtQty(r.qty_requested)} ${escapeHtml(lot.uom)}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label for="issue-qty">Actual quantity issued</label>
        <input type="number" id="issue-qty" min="0.0001" step="any" max="${lot.balance}">
        <div class="field-hint" id="issue-qty-hint"></div>
      </div>
      <div id="issue-error"></div>
      <button class="btn btn-primary btn-block" id="btn-confirm-issue">Confirm issue</button>
      <button class="btn btn-ghost btn-block" id="btn-scan-again" style="margin-top:var(--s2)">Scan a different lot</button>
    ` : `
      <div class="empty" style="margin-top:var(--s5)">
        <p>No open request for this item yet.</p>
        <button class="btn btn-outline" id="btn-scan-again">Scan a different lot</button>
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
      document.getElementById('issue-qty-hint').textContent = `Requested: ${fmtQty(opt.dataset.qty)} ${lot.uom}. Change this if the actual pick differs.`;
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
    const performedBy = prompt('Your name (for the transaction log):') || null;

    const btn = document.getElementById('btn-confirm-issue');
    btn.disabled = true; btn.textContent = 'Confirming…';
    try {
      const result = await DB.issueStock({ lotId: lot.lot_id, requestId, actualQty, performedBy });
      if (result.has_discrepancy) {
        toast(`Issued, but flagged: requested ${fmtQty(requestedQty)}, actual ${fmtQty(actualQty)}`, 'error');
      } else {
        toast('Issued and request closed', 'success');
      }
      resetScanView();
    } catch (err) {
      errEl.innerHTML = `<div class="form-error">${escapeHtml(err.message || 'Could not confirm issue')}</div>`;
      btn.disabled = false; btn.textContent = 'Confirm issue';
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
  el.innerHTML = REQUEST_STATUSES.map((s) => `<button data-status="${s}" aria-pressed="${s === requestStatus}">${s[0].toUpperCase()}${s.slice(1)}</button>`).join('');
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
      list.innerHTML = `<div class="empty"><p>No ${requestStatus === 'all' ? '' : requestStatus + ' '}requests.</p>
        <button class="btn btn-primary btn-sm" id="empty-new-request">+ New request</button></div>`;
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
          <span class="chip ${statusChipClass(r.status)}">${r.status}</span>
        </div>
        <div class="card-row" style="margin-top:var(--s3)">
          <span class="card-meta mono">${escapeHtml(r.request_code)} · needed ${fmtDate(r.needed_by)}</span>
          ${nextStatusButton(r)}
        </div>
      </div>
    `).join('');
    list.querySelectorAll('[data-advance]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await DB.setRequestStatus(btn.dataset.advance, btn.dataset.to);
          toast(`Marked ${btn.dataset.to}`, 'success');
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
  return `<button class="btn btn-outline btn-sm" data-advance="${r.id}" data-to="${next}">Mark ${next}</button>`;
}

document.getElementById('btn-new-request').addEventListener('click', openNewRequestSheet);

function openNewRequestSheet() {
  Sheet.open('New request', `
    <div id="nr-error"></div>
    <form id="form-new-request">
      <div class="field">
        <label for="nr-requester">Requester name</label>
        <input type="text" id="nr-requester" required>
      </div>
      <div class="field">
        <label for="nr-sku">Item</label>
        <select id="nr-sku" required>${activeSkusOptionsCache()}</select>
      </div>
      <div class="field-row">
        <div class="field">
          <label for="nr-qty">Quantity</label>
          <input type="number" id="nr-qty" min="0.0001" step="any" required>
        </div>
        <div class="field">
          <label for="nr-needed">Needed by</label>
          <input type="date" id="nr-needed">
        </div>
      </div>
      <div class="field">
        <label for="nr-notes">Notes (optional)</label>
        <textarea id="nr-notes"></textarea>
      </div>
      <button class="btn btn-primary btn-block" type="submit">Submit request</button>
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
      toast('Request submitted', 'success');
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
        ['SKU', 'Name', 'Category', 'On hand', 'Threshold', 'Status'],
        rows.map((r) => [r.sku_code, r.name, r.category,
          `<span class="num">${fmtQty(r.on_hand)} ${r.base_uom}</span>`,
          `<span class="num">${fmtQty(r.min_threshold)}</span>`,
          r.is_low ? '<span class="chip chip-low">Low</span>' : '<span class="chip chip-ok">OK</span>']),
      );
    } else if (kind === 'movement') {
      const rows = await DB.movementHistory();
      body.innerHTML = tableHtml(
        ['When', 'Type', 'SKU', 'Lot', 'Qty', 'By', 'Request'],
        rows.map((r) => [fmtDateTime(r.created_at), r.type, `${r.sku_code} — ${r.sku_name}`, r.lot_code,
          `<span class="num">${fmtQty(r.qty)} ${r.uom}</span>`, r.performed_by || '—', r.request_code || '—']),
      );
    } else if (kind === 'discrepancy') {
      const rows = await DB.discrepancyReport();
      if (!rows.length) { body.innerHTML = `<div class="empty"><p>No discrepancies recorded. Every issue has matched its request.</p></div>`; return; }
      body.innerHTML = tableHtml(
        ['When', 'Request', 'SKU', 'Lot', 'Requested', 'Actual', 'Variance'],
        rows.map((r) => [fmtDateTime(r.created_at), `${r.request_code} (${r.requester_name})`, `${r.sku_code} — ${r.sku_name}`, r.lot_code,
          `<span class="num">${fmtQty(r.requested_qty)}</span>`, `<span class="num">${fmtQty(r.actual_qty)}</span>`,
          `<span class="num" style="color:var(--discrepancy)">${r.variance > 0 ? '+' : ''}${fmtQty(r.variance)}</span>`]),
      );
    } else if (kind === 'lowstock') {
      const rows = await DB.lowStock();
      if (!rows.length) { body.innerHTML = `<div class="empty"><p>Nothing below threshold right now.</p></div>`; return; }
      body.innerHTML = tableHtml(
        ['SKU', 'Name', 'Category', 'On hand', 'Threshold'],
        rows.map((r) => [r.sku_code, r.name, r.category, `<span class="num">${fmtQty(r.on_hand)} ${r.base_uom}</span>`, `<span class="num">${fmtQty(r.min_threshold)}</span>`]),
      );
    }
  } catch (err) {
    body.innerHTML = '';
    toast(err.message || 'Could not load report', 'error');
  }
}

function tableHtml(headers, rows) {
  if (!rows.length) return `<div class="empty"><p>Nothing to show yet.</p></div>`;
  return `<div class="table-scroll"><table>
    <thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>
  </table></div>`;
}

// ---- Boot ------------------------------------------------------------------------
(async function init() {
  try {
    activeSkus = await DB.listSkus({ activeOnly: true });
  } catch (_) { /* stock view will surface the error */ }
  showView('stock');
})();
