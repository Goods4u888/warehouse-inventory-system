// ============================================================================
// Public requester form (request.html) — no login, no item picker. Submits
// straight to DB.createPublicRequest(), which calls the create_public_request
// RPC (see schema.sql): the database assigns the request number atomically,
// the same pattern used for lot codes and SKU codes elsewhere in this app.
// This file is intentionally standalone (doesn't load app.js) since almost
// none of the admin app's wiring applies to this page.
// ============================================================================

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
function fmtDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

document.getElementById('lang-toggle').addEventListener('click', () => {
  I18n.setLang(I18n.current === 'th' ? 'en' : 'th');
});
function onLanguageChange() { /* nothing dynamically rendered here needs a re-render */ }

function showFormView() {
  document.getElementById('view-form').hidden = false;
  document.getElementById('view-confirm').hidden = true;
}

function showConfirmView(request) {
  document.getElementById('view-form').hidden = true;
  document.getElementById('view-confirm').hidden = false;
  document.getElementById('confirm-code').textContent = request.request_code;
  document.getElementById('confirm-name').textContent = request.requester_name;
  document.getElementById('confirm-department').textContent = request.department || t('noDepartment');
  document.getElementById('confirm-when').textContent = fmtDateTime(request.created_at);
  document.getElementById('confirm-comment').textContent = request.notes || '';
}

document.getElementById('form-public-request').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = document.getElementById('request-error');
  errEl.innerHTML = '';
  const btn = document.getElementById('req-submit');
  btn.disabled = true;
  try {
    const request = await DB.createPublicRequest({
      requesterName: document.getElementById('req-name').value.trim(),
      department: document.getElementById('req-department').value.trim(),
      comment: document.getElementById('req-comment').value.trim(),
    });
    showConfirmView(request);
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
  showFormView();
});

// ---- Boot --------------------------------------------------------------------
document.documentElement.lang = I18n.current;
I18n.applyStatic();
applyStaticIcons();
