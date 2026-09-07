// ============================================================================
// A small inline-SVG icon set, drawn to match the tabbar icons already in
// index.html: 24x24 viewBox, no fill, currentColor stroke, stroke-width 1.8.
// icon(name, size) returns markup; boot() (called from app.js init) fills in
// every element carrying data-icon so index.html never has to inline SVG by
// hand.
// ============================================================================

const ICON_PATHS = {
  // chrome / actions
  refresh: '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
  globe: '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  sliders: '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
  qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v3M14 20h3M20 20h.01"/>',
  printer: '<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
  search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  checkCircle: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
  plusCircle: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>',
  xCircle: '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>',
  pencil: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
  arrowRight: '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>',
  send: '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
  repeat: '<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',

  // report tabs
  barChart: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
  swap: '<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
  alertTriangle: '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  trendingDown: '<polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/>',

  // request-status tabs
  list: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  package: '<line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
  checkSquare: '<polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',

  // material categories
  bag: '<path d="M7.5 3h9L18 7.5a6 8 0 0 1 .5 3V18a3 3 0 0 1-3 3H8.5a3 3 0 0 1-3-3v-7.5a6 8 0 0 1 .5-3L7.5 3z"/><line x1="8.3" y1="9" x2="15.7" y2="9"/>',
  rebar: '<line x1="5" y1="19" x2="19" y2="5"/><line x1="8" y1="19" x2="5" y2="16"/><line x1="12" y1="15" x2="9" y2="12"/><line x1="16" y1="11" x2="13" y2="8"/><line x1="19" y1="8" x2="16" y2="5"/>',
  pile: '<path d="M3 19h18"/><path d="M4 19 10 8l3 4 2.5-3L20 19"/>',
  pipe: '<rect x="3" y="9" width="18" height="6" rx="3"/><line x1="7.5" y1="9" x2="7.5" y2="15"/><line x1="16.5" y1="9" x2="16.5" y2="15"/>',
  wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  box: '<rect x="4" y="4" width="16" height="16" rx="2"/>',
  zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
  droplet: '<path d="M12 2.69 17.66 8.35a8 8 0 1 1-11.31 0z"/>',
  roller: '<rect x="3" y="4" width="14" height="6" rx="1.5"/><line x1="7" y1="10" x2="7" y2="14"/><rect x="5" y="14" width="4" height="6" rx="1"/>',
  planks: '<rect x="3" y="5" width="18" height="3.2" rx="1"/><rect x="3" y="10.4" width="18" height="3.2" rx="1"/><rect x="3" y="15.8" width="18" height="3.2" rx="1"/>',
  sparkle: '<path d="M12 3v4M12 17v4M5 5.5l2.8 2.8M16.2 15.7l2.8 2.8M3 12h4M17 12h4M5 18.5l2.8-2.8M16.2 8.3l2.8-2.8"/>',

  // landing page badges
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
};

function icon(name, size = 16) {
  const p = ICON_PATHS[name];
  if (!p) return '';
  return `<svg class="icon" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
}

// Category -> icon name, mirrors CATS in app.js (which maps category -> css class).
const CAT_ICONS = {
  Cement: 'bag', Steel: 'rebar', Aggregate: 'pile',
  'Pipe & Fittings': 'pipe', Hardware: 'wrench',
  Electrical: 'zap', 'Sanitary Ware': 'droplet', Paint: 'roller',
  Lumber: 'planks', 'Cleaning Supplies': 'sparkle',
};
function catIcon(category) {
  return CAT_ICONS[category] || 'box';
}

// Fills every static element carrying data-icon="<name>" (and optionally
// data-icon-size) with its SVG, inserted before any existing content (e.g. a
// data-i18n label span). Idempotent — skips elements already filled, so it's
// safe to call again after a re-render that doesn't touch those nodes.
function applyStaticIcons() {
  document.querySelectorAll('[data-icon]').forEach((el) => {
    if (el.querySelector(':scope > svg.icon')) return;
    const size = el.dataset.iconSize ? Number(el.dataset.iconSize) : 16;
    el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon, size));
  });
}
