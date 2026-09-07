// ============================================================================
// Public requester form (request.html) — no login. A requester can search
// the catalog and pick a specific item + quantity, write a free-text
// comment, or both (the database requires at least one — see the
// create_public_request check in schema.sql). Submits straight to
// DB.createPublicRequest(). This file is intentionally standalone (doesn't
// load app.js) since almost none of the admin app's wiring applies here.
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
}

function showFormView() {
  document.getElementById('view-form').hidden = false;
  document.getElementById('view-confirm').hidden = true;
}

function showConfirmView(request, selectedItem) {
  document.getElementById('view-form').hidden = true;
  document.getElementById('view-confirm').hidden = false;
  document.getElementById('confirm-code').textContent = request.request_code;
  document.getElementById('confirm-name').textContent = request.requester_name;
  document.getElementById('confirm-department').textContent = request.department || t('noDepartment');
  document.getElementById('confirm-when').textContent = fmtDateTime(request.created_at);

  const itemRow = document.getElementById('confirm-item-row');
  if (selectedItem) {
    itemRow.hidden = false;
    document.getElementById('confirm-item').textContent =
      `${selectedItem.name} — ${fmtQty(request.qty_requested)} ${selectedItem.base_uom || ''}`.trim();
  } else {
    itemRow.hidden = true;
  }

  const commentEl = document.getElementById('confirm-comment');
  if (request.notes) {
    commentEl.hidden = false;
    commentEl.textContent = request.notes;
  } else {
    commentEl.hidden = true;
    commentEl.textContent = '';
  }
}

// ---- Item search / picker --------------------------------------------------
let allItems = [];
let selectedItem = null;

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
  if (selectedItem || !q) {
    box.innerHTML = '';
    box.hidden = true;
    return;
  }
  const matches = allItems
    .filter((s) => s.name.toLowerCase().includes(q) || s.sku_code.toLowerCase().includes(q))
    .slice(0, 8);
  box.hidden = false;
  box.innerHTML = matches.length
    ? matches.map((s) => `
        <button type="button" class="req-item-option" data-id="${escapeHtml(s.id)}">
          ${icon(catIcon(s.category), 16)}
          <span class="req-item-option-text">
            <strong>${escapeHtml(s.name)}</strong>
            <span class="card-meta mono">${escapeHtml(s.sku_code)} · ${escapeHtml(s.base_uom)}</span>
          </span>
        </button>
      `).join('')
    : `<div class="req-item-empty">${escapeHtml(t('emptySearchResultsShort'))}</div>`;

  box.querySelectorAll('.req-item-option').forEach((btn) => {
    btn.addEventListener('click', () => selectItem(btn.getAttribute('data-id')));
  });
}

function selectItem(id) {
  const item = allItems.find((s) => s.id === id);
  if (!item) return;
  selectedItem = item;
  document.getElementById('req-item-search').value = '';
  document.getElementById('req-item-results').innerHTML = '';
  document.getElementById('req-item-results').hidden = true;
  document.getElementById('req-item-selected-name').textContent = item.name;
  document.getElementById('req-item-selected-code').textContent = `${item.sku_code} · ${item.base_uom}`;
  document.getElementById('req-item-selected').hidden = false;
  document.getElementById('req-item-qty').focus();
  updateCommentRequirement();
}

function clearItem() {
  selectedItem = null;
  document.getElementById('req-item-selected').hidden = true;
  document.getElementById('req-item-qty').value = '';
  updateCommentRequirement();
}

function updateCommentRequirement() {
  const commentEl = document.getElementById('req-comment');
  const hint = document.getElementById('req-comment-hint');
  if (selectedItem) {
    commentEl.removeAttribute('required');
    hint.hidden = true;
  } else {
    hint.hidden = false;
  }
}

document.getElementById('req-item-search').addEventListener('input', renderItemResults);
document.getElementById('req-item-clear').addEventListener('click', clearItem);

document.getElementById('form-public-request').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = document.getElementById('request-error');
  errEl.innerHTML = '';

  const comment = document.getElementById('req-comment').value.trim();
  const qtyRaw = document.getElementById('req-item-qty').value;

  if (selectedItem && (!qtyRaw || Number(qtyRaw) <= 0)) {
    errEl.innerHTML = `<div class="form-error">${escapeHtml(t('errorQtyRequired'))}</div>`;
    document.getElementById('req-item-qty').focus();
    return;
  }
  if (!selectedItem && !comment) {
    errEl.innerHTML = `<div class="form-error">${escapeHtml(t('errorItemOrComment'))}</div>`;
    return;
  }

  const btn = document.getElementById('req-submit');
  btn.disabled = true;
  try {
    const request = await DB.createPublicRequest({
      requesterName: document.getElementById('req-name').value.trim(),
      department: document.getElementById('req-department').value.trim(),
      comment: comment || null,
      skuId: selectedItem ? selectedItem.id : null,
      qty: selectedItem ? Number(qtyRaw) : null,
    });
    showConfirmView(request, selectedItem);
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
  clearItem();
  updateCommentRequirement();
  showFormView();
});

// ---- Boot --------------------------------------------------------------------
document.documentElement.lang = I18n.current;
I18n.applyStatic();
applyStaticIcons();
updateCommentRequirement();
loadItems();
