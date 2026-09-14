// ============================================================================
// Public requester form (request.html) — no login. A requester can search
// the catalog and add any number of items (each with its own quantity), a
// free-text comment, or both (the database requires at least one — see the
// create_public_request check in schema.sql). Submitting hands back one
// request_code shared by every item in the list. This file is intentionally
// standalone (doesn't load app.js) since almost none of the admin app's
// wiring applies here.
// ============================================================================

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
function fmtQty(n) {
  if (n === null || n === undefined) return '';
  const num = Number(n);
  return Number.isInteger(num) ? String(num) : num.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}
function fmtDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

document.getElementById('lang-toggle').addEventListener('click', () => {
  I18n.setLang(I18n.current === 'th' ? 'en' : 'th');
});
function onLanguageChange() {
  renderItemResults(); // re-render category labels/hints in the new language
  renderItemList();
}

function showFormView() {
  document.getElementById('view-form').hidden = false;
  document.getElementById('view-confirm').hidden = true;
}

function showConfirmView({ requestCode, createdAt, requesterName, department, workArea, building, items: submittedItems, comment }) {
  document.getElementById('view-form').hidden = true;
  document.getElementById('view-confirm').hidden = false;
  document.getElementById('confirm-code').textContent = requestCode;
  document.getElementById('confirm-name').textContent = requesterName;
  document.getElementById('confirm-department').textContent = department || t('noDepartment');
  document.getElementById('confirm-workarea').textContent = workArea;
  document.getElementById('confirm-building').textContent = building || t('noBuilding');
  document.getElementById('confirm-when').textContent = fmtDateTime(createdAt);

  const itemsBlock = document.getElementById('confirm-items-block');
  const itemsBox = document.getElementById('confirm-items');
  if (submittedItems.length) {
    itemsBlock.hidden = false;
    itemsBox.innerHTML = submittedItems.map((it) => `
      <div class="req-item-row req-item-row-readonly">
        <span class="req-item-row-text">
          <strong>${escapeHtml(it.name)}</strong>
          <span class="card-meta mono">${escapeHtml(it.sku_code)}</span>
        </span>
        <span class="req-item-row-qty-display">${escapeHtml(fmtQty(it.qty))} ${escapeHtml(it.base_uom || '')}</span>
      </div>
    `).join('');
  } else {
    itemsBlock.hidden = true;
    itemsBox.innerHTML = '';
  }

  const commentEl = document.getElementById('confirm-comment');
  if (comment) {
    commentEl.hidden = false;
    commentEl.textContent = comment;
  } else {
    commentEl.hidden = true;
    commentEl.textContent = '';
  }

  renderPrintSheet({ requestCode, createdAt, requesterName, department, workArea, building, items: submittedItems, comment });
}

// The printable/PDF form (see .print-sheet in request.html) — a numbered
// item table plus 4 blank signature boxes, modeled on the paper requisition
// slip this replaces. Populated once at confirm time; nothing here is
// interactive, it only ever needs to exist for window.print().
function renderPrintSheet({ requestCode, createdAt, requesterName, department, workArea, building, items: submittedItems, comment }) {
  document.getElementById('print-code').textContent = requestCode;
  document.getElementById('print-date').textContent = fmtDateTime(createdAt);
  document.getElementById('print-department').textContent = department || t('noDepartment');
  document.getElementById('print-name').textContent = requesterName;
  document.getElementById('print-workarea').textContent = workArea;
  document.getElementById('print-building').textContent = building || t('noBuilding');
  // Repeats at the bottom of every printed page (see .print-sheet-footer) so
  // a multi-page slip stays identifiable if pages get separated.
  document.getElementById('print-footer').textContent = t('printFooterNote', requestCode);

  const rows = submittedItems.length
    ? submittedItems.map((it, i) => `
        <tr>
          <td class="print-col-no">${i + 1}</td>
          <td>${escapeHtml(it.name)} <span class="mono">(${escapeHtml(it.sku_code)})</span></td>
          <td class="print-col-qty">${escapeHtml(fmtQty(it.qty))}</td>
          <td class="print-col-unit">${escapeHtml(it.base_uom || '')}</td>
        </tr>
      `).join('')
    // Comment-only request: no item list, so the comment (always present in
    // this case — the database requires one or the other) stands in as the
    // single line item on the printed table.
    : `
        <tr>
          <td class="print-col-no">1</td>
          <td>${escapeHtml(comment || '—')}</td>
          <td class="print-col-qty"></td>
          <td class="print-col-unit"></td>
        </tr>
      `;
  document.getElementById('print-items').innerHTML = rows;

  // The comment already IS the line item when there's no item list (above);
  // only surface it as a separate notes line when there's also a real item
  // list, so it isn't shown twice and isn't lost either way.
  const notesEl = document.getElementById('print-notes');
  if (submittedItems.length && comment) {
    notesEl.hidden = false;
    document.getElementById('print-notes-text').textContent = comment;
  } else {
    notesEl.hidden = true;
  }
}

// ---- Item search / picker (a list, not a single pick) ----------------------
let allItems = [];
let items = []; // { id, name, sku_code, base_uom, qty }

async function loadItems() {
  try {
    allItems = await DB.listActiveSkusForRequest();
  } catch (_) {
    allItems = []; // search just comes up empty; comment box still works
  }
}

function renderItemResults() {
  const box = document.getElementById('req-item-results');
  const q = document.getElementById('req-item-search').value.trim().toLowerCase();
  if (!q) {
    box.innerHTML = '';
    box.hidden = true;
    return;
  }
  const addedIds = new Set(items.map((it) => it.id));
  const matches = allItems
    .filter((s) => !addedIds.has(s.id) && (s.name.toLowerCase().includes(q) || s.sku_code.toLowerCase().includes(q)))
    .slice(0, 8);
  box.hidden = false;
  box.innerHTML = matches.length
    ? matches.map((s) => `
        <button type="button" class="req-item-option" data-id="${escapeHtml(s.id)}">
          ${s.image_paths?.[0] ? `<img class="req-item-option-thumb" src="${DB.getItemPhotoUrl(s.image_paths[0])}" alt="">` : icon(catIcon(s.category), 16)}
          <span class="req-item-option-text">
            <strong>${escapeHtml(s.name)}</strong>
            <span class="card-meta mono">${escapeHtml(s.sku_code)} · ${escapeHtml(s.base_uom)}</span>
          </span>
        </button>
      `).join('')
    : `<div class="req-item-empty">${escapeHtml(t('emptySearchResultsShort'))}</div>`;

  box.querySelectorAll('.req-item-option').forEach((btn) => {
    btn.addEventListener('click', () => addItem(btn.getAttribute('data-id')));
  });
}

function renderItemList() {
  const box = document.getElementById('req-item-list');
  box.innerHTML = items.map((it) => `
    <div class="req-item-row" data-id="${escapeHtml(it.id)}">
      <span class="req-item-row-text">
        <strong>${escapeHtml(it.name)}</strong>
        <span class="card-meta mono">${escapeHtml(it.sku_code)} · ${escapeHtml(it.base_uom)}</span>
      </span>
      <input type="number" class="req-item-row-qty" data-id="${escapeHtml(it.id)}" min="0.0001" step="any"
        value="${it.qty === '' ? '' : escapeHtml(String(it.qty))}" placeholder="${escapeHtml(t('fieldQtyNeeded'))}">
      <button type="button" class="req-item-row-remove" data-id="${escapeHtml(it.id)}" data-icon="xCircle" aria-label="${escapeHtml(t('btnRemoveItem'))}"></button>
    </div>
  `).join('');
  applyStaticIcons();

  box.querySelectorAll('.req-item-row-qty').forEach((input) => {
    input.addEventListener('input', () => {
      const it = items.find((x) => x.id === input.getAttribute('data-id'));
      if (it) it.qty = input.value;
    });
  });
  box.querySelectorAll('.req-item-row-remove').forEach((btn) => {
    btn.addEventListener('click', () => removeItem(btn.getAttribute('data-id')));
  });

  updateCommentRequirement();
}

function addItem(id) {
  if (items.some((it) => it.id === id)) return;
  const item = allItems.find((s) => s.id === id);
  if (!item) return;
  items.push({ id: item.id, name: item.name, sku_code: item.sku_code, base_uom: item.base_uom, qty: '' });
  document.getElementById('req-item-search').value = '';
  document.getElementById('req-item-results').innerHTML = '';
  document.getElementById('req-item-results').hidden = true;
  renderItemList();
  const qtyInput = document.querySelector(`.req-item-row-qty[data-id="${CSS.escape(id)}"]`);
  if (qtyInput) qtyInput.focus();
}

function removeItem(id) {
  items = items.filter((it) => it.id !== id);
  renderItemList();
}

function updateCommentRequirement() {
  const hint = document.getElementById('req-comment-hint');
  hint.hidden = items.length > 0;
}

// ---- Department dropdown --------------------------------------------------
// Same "reference table + inline add" pattern as Manage Staff's department
// dropdown (js/app.js). Department is required here (unlike Building below),
// so the placeholder option is disabled — a real choice must be made before
// the form's native validation lets the request submit.
let departments = [];

async function loadDepartments() {
  try {
    departments = await DB.listDepartments();
    renderDepartmentOptions();
  } catch (_) {
    // Dropdown just comes up empty (only the placeholder option) — same
    // silent fallback as loadItems()/loadBuildings() above.
  }
}
function renderDepartmentOptions(selected = '') {
  const sel = document.getElementById('req-department');
  const current = selected || sel.value;
  sel.innerHTML = `
    <option value="" disabled ${current ? '' : 'selected'}>${t('noDepartment')}</option>
    ${departments.map((d) => `<option value="${escapeHtml(d.name)}" ${d.name === current ? 'selected' : ''}>${escapeHtml(d.name)}</option>`).join('')}
  `;
}
async function onAddDepartment(newInput, newRow) {
  const name = newInput.value.trim();
  const errEl = document.getElementById('request-error');
  errEl.innerHTML = '';
  if (!name) return;
  try {
    await DB.createDepartment(name);
    departments = await DB.listDepartments();
    renderDepartmentOptions(name);
    newInput.value = '';
    newRow.hidden = true;
  } catch (err) {
    const msg = /duplicate|unique/i.test(err.message || '') ? t('errorDepartmentExists') : (err.message || 'Could not add department');
    errEl.innerHTML = `<div class="form-error">${escapeHtml(msg)}</div>`;
  }
}
(() => {
  const addBtn = document.getElementById('req-department-add-btn');
  const newRow = document.getElementById('req-department-new-row');
  const newInput = document.getElementById('req-department-new-input');
  addBtn.addEventListener('click', () => {
    newRow.hidden = !newRow.hidden;
    if (!newRow.hidden) newInput.focus();
  });
  document.getElementById('req-department-new-cancel').addEventListener('click', () => {
    newInput.value = '';
    newRow.hidden = true;
  });
  document.getElementById('req-department-new-confirm').addEventListener('click', () => onAddDepartment(newInput, newRow));
  newInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); onAddDepartment(newInput, newRow); }
  });
})();

// ---- Work area dropdown ---------------------------------------------------
// Same "reference table + inline add" pattern as Building below. Required
// (unlike Building), so the placeholder option is disabled — same reasoning
// as the Department dropdown above.
let workAreas = [];

async function loadWorkAreas() {
  try {
    workAreas = await DB.listWorkAreas();
    renderWorkAreaOptions();
  } catch (_) {
    // Dropdown just comes up empty (only the placeholder option) — same
    // silent fallback as loadItems()/loadBuildings() above.
  }
}
function renderWorkAreaOptions(selected = '') {
  const sel = document.getElementById('req-workarea');
  const current = selected || sel.value;
  sel.innerHTML = `
    <option value="" disabled ${current ? '' : 'selected'}>${t('noWorkArea')}</option>
    ${workAreas.map((w) => `<option value="${escapeHtml(w.name)}" ${w.name === current ? 'selected' : ''}>${escapeHtml(w.name)}</option>`).join('')}
  `;
}
async function onAddWorkArea(newInput, newRow) {
  const name = newInput.value.trim();
  const errEl = document.getElementById('request-error');
  errEl.innerHTML = '';
  if (!name) return;
  try {
    await DB.createWorkArea(name);
    workAreas = await DB.listWorkAreas();
    renderWorkAreaOptions(name);
    newInput.value = '';
    newRow.hidden = true;
  } catch (err) {
    const msg = /duplicate|unique/i.test(err.message || '') ? t('errorWorkAreaExists') : (err.message || 'Could not add area');
    errEl.innerHTML = `<div class="form-error">${escapeHtml(msg)}</div>`;
  }
}
(() => {
  const addBtn = document.getElementById('req-workarea-add-btn');
  const newRow = document.getElementById('req-workarea-new-row');
  const newInput = document.getElementById('req-workarea-new-input');
  addBtn.addEventListener('click', () => {
    newRow.hidden = !newRow.hidden;
    if (!newRow.hidden) newInput.focus();
  });
  document.getElementById('req-workarea-new-cancel').addEventListener('click', () => {
    newInput.value = '';
    newRow.hidden = true;
  });
  document.getElementById('req-workarea-new-confirm').addEventListener('click', () => onAddWorkArea(newInput, newRow));
  newInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); onAddWorkArea(newInput, newRow); }
  });
})();

// ---- Building dropdown ---------------------------------------------------
// Same "reference table + inline add" pattern as Manage Staff's department
// dropdown (js/app.js), but open to anon here (see "buildings" RLS in
// schema.sql) — a requester in a building not yet listed isn't blocked.
let buildings = [];

async function loadBuildings() {
  try {
    buildings = await DB.listBuildings();
    renderBuildingOptions();
  } catch (_) {
    // Dropdown just comes up empty (only the "—" option) — same silent
    // fallback as loadItems() above, since this page has no toast() helper.
  }
}
function renderBuildingOptions(selected = '') {
  const sel = document.getElementById('req-building');
  const current = selected || sel.value;
  sel.innerHTML = `
    <option value="">${t('noBuilding')}</option>
    ${buildings.map((b) => `<option value="${escapeHtml(b.name)}" ${b.name === current ? 'selected' : ''}>${escapeHtml(b.name)}</option>`).join('')}
  `;
}
async function onAddBuilding(newInput, newRow) {
  const name = newInput.value.trim();
  const errEl = document.getElementById('request-error');
  errEl.innerHTML = '';
  if (!name) return;
  try {
    await DB.createBuilding(name);
    buildings = await DB.listBuildings();
    renderBuildingOptions(name);
    newInput.value = '';
    newRow.hidden = true;
  } catch (err) {
    const msg = /duplicate|unique/i.test(err.message || '') ? t('errorBuildingExists') : (err.message || 'Could not add building');
    errEl.innerHTML = `<div class="form-error">${escapeHtml(msg)}</div>`;
  }
}
(() => {
  const addBtn = document.getElementById('req-building-add-btn');
  const newRow = document.getElementById('req-building-new-row');
  const newInput = document.getElementById('req-building-new-input');
  addBtn.addEventListener('click', () => {
    newRow.hidden = !newRow.hidden;
    if (!newRow.hidden) newInput.focus();
  });
  document.getElementById('req-building-new-cancel').addEventListener('click', () => {
    newInput.value = '';
    newRow.hidden = true;
  });
  document.getElementById('req-building-new-confirm').addEventListener('click', () => onAddBuilding(newInput, newRow));
  newInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); onAddBuilding(newInput, newRow); }
  });
})();

document.getElementById('req-item-search').addEventListener('input', renderItemResults);

document.getElementById('form-public-request').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = document.getElementById('request-error');
  errEl.innerHTML = '';

  const comment = document.getElementById('req-comment').value.trim();

  const missingQty = items.find((it) => !it.qty || Number(it.qty) <= 0);
  if (missingQty) {
    errEl.innerHTML = `<div class="form-error">${escapeHtml(t('errorQtyRequired'))}</div>`;
    const qtyInput = document.querySelector(`.req-item-row-qty[data-id="${CSS.escape(missingQty.id)}"]`);
    if (qtyInput) qtyInput.focus();
    return;
  }
  if (!items.length && !comment) {
    errEl.innerHTML = `<div class="form-error">${escapeHtml(t('errorItemOrComment'))}</div>`;
    return;
  }

  const requesterName = document.getElementById('req-name').value.trim();
  const department = document.getElementById('req-department').value.trim();
  const workArea = document.getElementById('req-workarea').value.trim();
  const building = document.getElementById('req-building').value.trim();

  const btn = document.getElementById('req-submit');
  btn.disabled = true;
  try {
    const rows = await DB.createPublicRequest({
      requesterName,
      department,
      comment: comment || null,
      workArea,
      building: building || null,
      items: items.map((it) => ({ skuId: it.id, qty: Number(it.qty) })),
    });
    const first = Array.isArray(rows) ? rows[0] : rows; // fake-client / real client both hand back the RPC's rows
    showConfirmView({
      requestCode: first.request_code,
      createdAt: first.created_at,
      requesterName,
      department,
      workArea,
      building,
      items,
      comment,
    });
  } catch (err) {
    errEl.innerHTML = `<div class="form-error">${escapeHtml(err.message || t('errorRequestFailed'))}</div>`;
  } finally {
    btn.disabled = false;
  }
});

document.getElementById('btn-print').addEventListener('click', () => window.print());

document.getElementById('btn-submit-another').addEventListener('click', () => {
  document.getElementById('form-public-request').reset();
  document.getElementById('request-error').innerHTML = '';
  items = [];
  renderItemList();
  showFormView();
});

// ---- Boot --------------------------------------------------------------------
document.documentElement.lang = I18n.current;
I18n.applyStatic();
applyStaticIcons();
updateCommentRequirement();
loadItems();
loadDepartments();
loadWorkAreas();
loadBuildings();
