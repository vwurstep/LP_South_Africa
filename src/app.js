/* Wiring: loads data, builds filters/search, connects map <-> sheet, add-place flow. */
import * as data from './data.js';
import { createMap, countTiles, downloadTiles } from './map.js';
import { createSheet } from './sheet.js';
import * as F from './filters.js';
import * as T from './theme.js';

const $ = (s) => document.querySelector(s);
let guide, mapView, sheet;
let fstate = F.loadState(), facets = [];
let showShapes = localStorage.getItem('lp.shapes') !== 'off';
let appearance = T.loadMode(), theme = 'day';

// ---- unlock ------------------------------------------------------------------
async function start() {
  try { guide = await data.loadGuide(); boot(); }
  catch (e) {
    // only ask for the passphrase if it's missing or really wrong — not when loading failed
    if (e.message === 'load-failed' && data.savedPassphrase()) return showLoadError();
    showUnlock(e.message === 'bad-passphrase');
  }
}

function showLoadError() {
  const box = document.createElement('div');
  box.id = 'load-error';
  box.innerHTML = '<p>Couldn’t load the guide — no connection?</p><button class="primary">Retry</button>';
  box.querySelector('button').onclick = () => { box.remove(); start(); };
  document.body.appendChild(box);
}

function showUnlock(wrong) {
  const dlg = $('#unlock');
  $('#unlock-error').hidden = !wrong;
  dlg.showModal();
  $('#unlock form').onsubmit = async (e) => {
    e.preventDefault();
    try { guide = await data.loadGuide($('#passphrase').value); dlg.close(); boot(); }
    catch (err) { $('#unlock-error').hidden = false; $('#unlock-error').textContent = err.message === 'bad-passphrase' ? 'Wrong passphrase.' : 'Could not load the guide (offline on first start?).'; }
  };
}

// ---- main ----------------------------------------------------------------------
function allPlaces() { return [...guide.places, ...data.userPlaces()]; }
function placeById(id) { return guide.placeById[id] || data.userPlaces().find((p) => p.id === id); }

function boot() {
  theme = T.resolve(appearance, sunPosition());
  applyTheme();
  mapView = createMap($('#map'), {
    onPlaceClick: (id, others) => openPlace(id, false, others),
    onLongPress: (ll) => openAdd({ lat: ll.lat, lng: ll.lng }),
    onView: ({ bearing, pitch }) => updateCompass(bearing, pitch),
    onLocate: (state, fix) => {
      if (state === 'fix') { try { localStorage.setItem('lp.lastpos', JSON.stringify(fix)); } catch {} return; }
      $('#btn-locate').classList.toggle('following', state === 'following');  // blue while the map follows you
    },
    theme,
  });
  sheet = createSheet($('#sheet'), {
    guide,
    onRef: openRef,
    onOpenPlace: (id) => openPlace(id),
    onEditUser: (p) => openAdd(p),
    onClose: () => mapView.select(null),
    onChange: () => { refresh(); buildChips(); },
  });
  mapView.showShapes(showShapes);
  window.__lp = { mapView, guide };  // handle for tests & design mockups
  setupFilters();
  setupDock();
  buildChips();
  refresh();
  setupSearch();
  setupMenu();
  setupAppearance();
  setupSync();
}

// ---- floating bar + compass/location ------------------------------------------------
function setupDock() {
  $('#btn-saved').onclick = () => { fstate.favOnly = !fstate.favOnly; F.saveState(fstate); refresh(); buildChips(); };
  $('#btn-routes').onclick = () => { fstate.routesOnly = !fstate.routesOnly; F.saveState(fstate); refresh(); buildChips(); };
  $('#btn-locate').onclick = () => mapView.locate();
  $('#btn-north').onclick = () => mapView.resetNorth();
}
function updateCompass(bearing, pitch) {
  const turned = Math.abs(bearing) > 1 || pitch > 1;  // compass only when the map isn't north-up
  $('#btn-north').hidden = !turned; $('#side-sep').hidden = !turned;
  $('#btn-north .needle').style.transform = `rotate(${-bearing}deg)`;
}

// ---- day / night ------------------------------------------------------------------------
function sunPosition() {  // last GPS fix, else the last map view, else Cape Town
  try { const f = JSON.parse(localStorage.getItem('lp.lastpos')); if (f) return f; } catch {}
  try { const v = JSON.parse(localStorage.getItem('lp.view')); if (v) return { lng: v.center[0], lat: v.center[1] }; } catch {}
  return { lat: -33.92, lng: 18.42 };
}
function applyTheme() {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', theme === 'night' ? '#151a21' : '#ffffff');
  mapView?.setTheme(theme);
}
function updateTheme() {
  const t = T.resolve(appearance, sunPosition());
  if (t !== theme) { theme = t; applyTheme(); }
  for (const b of document.querySelectorAll('#appearance button')) {
    b.classList.toggle('on', b.dataset.mode === appearance); b.setAttribute('aria-checked', b.dataset.mode === appearance);
  }
  const pos = sunPosition(), sun = T.sunTimes(new Date(), pos.lat, pos.lng);
  $('#appearance-note').textContent = appearance === 'auto' && sun
    ? `Auto: night from sunset (${T.fmtTime(sun.sunset)}) until sunrise (${T.fmtTime(sun.sunrise)}) where you are.`
    : appearance === 'auto' ? 'Auto follows sunset and sunrise where you are.' : `Always ${appearance} until you choose Auto again.`;
}
function setupAppearance() {
  $('#appearance').onclick = (e) => {
    const b = e.target.closest('[data-mode]'); if (!b) return;
    appearance = b.dataset.mode; T.saveMode(appearance); updateTheme();
  };
  updateTheme();
  setInterval(updateTheme, 5 * 60 * 1000);  // catches sunset/sunrise while the app is open
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && updateTheme());
}

function visible() {
  return allPlaces().filter(F.matcher(fstate, (id) => data.annotation(id).fav));
}
function refresh() {
  const favs = new Set(allPlaces().filter((p) => data.annotation(p.id).fav).map((p) => p.id));
  mapView.setPlaces(visible(), favs);
}

function openPlace(id, fly = true, others = []) {
  const p = placeById(id);
  if (!p) return;
  sheet.open(p, others);
  mapView.select(p.id);
  if (fly) mapView.flyTo(p, sheet.height() / 2);
}

// a link inside guide text: to a place (poiss-N) or to a section (ref-N)
function openRef(ref) {
  const p = guide.places.find((q) => q.mentions.some((m) => m.anchor === ref));
  if (p) return openPlace(p.id);
  const s = guide.sections.find((x) => x.anchor === ref || x.html.includes(`id="${ref}"`));
  if (s) sheet.open({ id: 'section-' + s.id, name: s.title, category: 'info', mentions: [{ section: s.id, anchor: ref }], lat: 0, lng: 0 });
}

// ---- filters: button + panel (logic in filters.js) --------------------------------
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function buildChips() {  // (name kept: called after any data change) — refresh counts + labels
  facets = F.buildFacets(allPlaces());
  const n = visible().length, total = allPlaces().length, filtered = F.activeCount(fstate) > 0;
  const panelFiltered = Object.values(fstate.off).some((a) => a.length);
  $('#btn-filter').classList.toggle('on', panelFiltered);
  $('#btn-saved').classList.toggle('on', !!fstate.favOnly);
  $('#btn-routes').classList.toggle('on', !!fstate.routesOnly);
  $('#shown-count').textContent = n.toLocaleString();
  $('#btn-filter').setAttribute('aria-label', filtered ? `Filter: ${n} of ${total} shown` : `Filter: all ${total} shown`);
  if ($('#filters').open) renderFilterPanel();
}
function renderFilterPanel() {
  const opt = (f, o) => `<button class="chip ${F.isOn(fstate, f.id, o.id) ? 'on' : ''}" data-f="${f.id}" data-o="${esc(o.id)}" style="--c:${o.color}">`
    + `${esc(o.label)}${o.sub ? ` <em>${esc(o.sub)}</em>` : ''}<small>${o.n.toLocaleString()}</small></button>`;
  $('#filters .fp-body').innerHTML = `
    <div class="fp-top"><strong>${visible().length.toLocaleString()} shown</strong>
      <button class="link" data-fit="1">Show on map</button><span class="spacer"></span>
      <button data-all="1">Select all</button><button data-none="1">Deselect all</button></div>
    ${fstate.routesOnly ? '<p class="muted small">“Routes” is on in the bar: only routes are shown.</p>' : ''}
    ${facets.map((f) => `<section>
      <div class="fp-head"><h4>${f.label}</h4>${f.note ? `<small class="muted">${f.note}</small>` : ''}<span class="spacer"></span>
        <button class="link" data-fall="${f.id}">All</button><span class="muted">·</span><button class="link" data-fnone="${f.id}">None</button></div>
      <div class="fp-opts">${f.options.map((o) => opt(f, o)).join('')}</div></section>`).join('')}
    <section><div class="fp-head"><h4>Favourites</h4></div>
      <div class="fp-opts"><button class="chip ${fstate.favOnly ? 'on' : ''}" data-favonly="1" style="--c:#fab005">★ Show only my favourites</button></div></section>`;
}
function setupFilters() {
  const dlg = $('#filters');
  $('#btn-filter').onclick = () => { renderFilterPanel(); dlg.showModal(); };
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg || e.target.closest('[data-done]')) return dlg.close();  // tap outside or Done
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.fit) { dlg.close(); return mapView.fitPlaces(visible()); }  // zoom to what's shown
    if (b.dataset.all || b.dataset.none) { F.setAll(fstate, facets, !!b.dataset.all); if (b.dataset.all) fstate.favOnly = fstate.routesOnly = false; }
    else if (b.dataset.fall || b.dataset.fnone) F.setAll(fstate, facets, !!b.dataset.fall, b.dataset.fall || b.dataset.fnone);
    else if (b.dataset.favonly) fstate.favOnly = !fstate.favOnly;
    else if (b.dataset.f) F.setOn(fstate, b.dataset.f, b.dataset.o, !F.isOn(fstate, b.dataset.f, b.dataset.o));
    else return;
    F.saveState(fstate); refresh(); buildChips();
  });
}

// ---- search -------------------------------------------------------------------
function setupSearch() {
  const input = $('#search'), list = $('#results');
  const norm = (s) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
  input.addEventListener('input', () => {
    const q = norm(input.value.trim());
    if (q.length < 2) { list.hidden = true; return; }
    const rank = (p) => { const n = norm(p.name); return n === q ? 0 : n.startsWith(q) ? 1 : n.includes(q) ? 2 : 3; };
    const hits = allPlaces().filter((p) => norm(p.name).includes(q) || norm(p.subcategory || '').includes(q))
      .sort((a, b) => rank(a) - rank(b) || a.name.length - b.name.length).slice(0, 30);
    list.innerHTML = hits.map((p) => `<li data-id="${p.id}"><i style="background:${data.CATEGORIES[p.category].color}"></i>${p.name}<small>${p.locality || p.area || p.subcategory || ''}</small></li>`).join('') || '<li class="muted">No match</li>';
    list.hidden = false;
  });
  list.onclick = (e) => {
    const li = e.target.closest('li[data-id]'); if (!li) return;
    list.hidden = true; input.value = ''; input.blur();
    openPlace(li.dataset.id);
  };
}

// ---- add / edit own place -------------------------------------------------------
function openAdd(p = {}) {
  const dlg = $('#add');
  const f = dlg.querySelector('form');
  f.name.value = p.name || '';
  f.note.value = p.note || '';
  f.loc.value = p.lat != null ? `${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}` : '';
  f.dataset.id = p.user ? p.id : '';
  $('#add-delete').hidden = !p.user;
  $('#add-error').hidden = true;
  dlg.showModal();
  f.loc.oninput = () => {
    const loc = data.parseLocation(f.loc.value);
    if (loc?.name && !f.name.value) f.name.value = loc.name;
  };
  $('#add-gps').onclick = () => navigator.geolocation.getCurrentPosition(
    (pos) => (f.loc.value = `${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`),
    () => { $('#add-error').hidden = false; $('#add-error').textContent = 'No GPS position.'; },
    { enableHighAccuracy: true, timeout: 10000 });
  $('#add-center').onclick = () => { const c = mapView.center(); f.loc.value = `${c.lat.toFixed(6)}, ${c.lng.toFixed(6)}`; };
  $('#add-delete').onclick = () => { data.deleteUserPlace(f.dataset.id); dlg.close(); sheet.close(); buildChips(); refresh(); };
  f.onsubmit = (e) => {
    if (e.submitter?.value === 'cancel') return;
    const loc = data.parseLocation(f.loc.value);
    if (!loc) { e.preventDefault(); $('#add-error').hidden = false; $('#add-error').textContent = 'Location not recognised. Paste “lat, lng” or a full Google Maps URL.'; return; }
    const saved = data.saveUserPlace({ id: f.dataset.id || undefined, name: f.name.value.trim() || 'My place', note: f.note.value.trim(), lat: loc.lat, lng: loc.lng });
    F.setOn(fstate, 'source', 'mine', true); F.setOn(fstate, 'kind', 'places', true); F.saveState(fstate); buildChips(); refresh();
    openPlace(saved.id);
  };
}

// ---- menu: add, offline, backup, lock -----------------------------------------
function setupMenu() {
  $('#btn-add').onclick = () => openAdd();
  $('[data-act=shapes]').textContent = showShapes ? 'Hide areas & routes' : 'Show areas & routes';
  const menu = $('#menu');
  $('#btn-menu').onclick = () => menu.showModal();
  menu.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    if (act === 'close') menu.close();
    if (act === 'offline') {
      // highest detail (max zoom 14) that keeps the download reasonable
      const b = mapView.bounds();
      let z = 14; while (z > 8 && countTiles(b, z) > 15000) z--;
      const n = countTiles(b, z);
      const note = z < 14 ? `\n(Detail limited to zoom ${z} — zoom in further to save streets in full detail.)` : '';
      if (!confirm(`Download ${n} map tiles (about ${Math.round(n * 0.04)} MB) for the visible area?${note}`)) return;
      const out = $('#offline-progress');
      const res = await downloadTiles(b, z, (d, t) => (out.textContent = `${d} / ${t}`));
      out.textContent = res.failed ? `Done, ${res.failed} failed — try again.` : 'Done — this area works offline.';
    }
    if (act === 'export') {
      const blob = new Blob([JSON.stringify(data.exportUserData(), null, 1)], { type: 'application/json' });
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `my-places-${new Date().toISOString().slice(0, 10)}.json` });
      a.click();
    }
    if (act === 'import') $('#import-file').click();
    if (act === 'shapes') {
      showShapes = !showShapes;
      localStorage.setItem('lp.shapes', showShapes ? 'on' : 'off');
      mapView.showShapes(showShapes);
      e.target.textContent = showShapes ? 'Hide areas & routes' : 'Show areas & routes';
    }
    if (act === 'lock' && confirm('Forget the passphrase on this device?')) { data.forgetPassphrase(); location.reload(); }
  });
  $('#import-file').onchange = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    data.importUserData(JSON.parse(await file.text()));
    buildChips(); refresh(); menu.close();
  };
}

// ---- sync of stars/notes/own places to GitHub (optional) ----------------------------
function setupSync() {
  const status = $('#sync-status'), input = $('#sync-token');
  const show = (msg) => {
    const s = data.syncSettings();
    status.textContent = msg || (s ? (s.last ? `Synced ${new Date(s.last).toLocaleString()}` : 'Sync on') : 'Sync off — your data stays on this phone only.');
    $('#sync-off').hidden = !s;
  };
  let timer = null, running = false;
  async function run() {
    if (running || !data.syncSettings() || !navigator.onLine) return;
    running = true; show('Syncing…');
    try { await data.sync(); show(); buildChips(); refresh(); }
    catch (e) { show(`Sync failed (${e.message}) — will retry.`); }
    running = false;
  }
  data.onUserDataChange(() => { clearTimeout(timer); timer = setTimeout(run, 2500); });
  addEventListener('online', run);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && run());
  $('#sync-save').onclick = () => {
    const token = input.value.trim(); if (!token) return;
    data.setSyncSettings({ token, repo: 'vwurstep/LP_South_Africa', branch: 'userdata', path: 'user.enc.json' });
    input.value = ''; run();
  };
  $('#sync-off').onclick = () => { if (confirm('Turn off sync on this device?')) { data.setSyncSettings(null); show(); } };
  show(); run();
  navigator.storage?.persist?.();
}

// ---- app updates ------------------------------------------------------------------
// iOS keeps a home-screen app alive in memory, so reopening it doesn't reload it. Compare
// the loaded version with version.json on the server and offer a one-tap update.
let appVersion = null;
async function serverVersion() {
  const r = await fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' });
  return (await r.json()).version;
}
async function checkForUpdate(manual = false) {
  const out = $('#update-status');
  try {
    const v = await serverVersion();
    if (appVersion && v !== appVersion) { $('#update-banner').hidden = false; if (manual) out.textContent = `New version ${v} available.`; }
    else if (manual) out.textContent = `You have the latest version (${appVersion}).`;
  } catch { if (manual) out.textContent = 'Offline — can’t check for updates.'; }
}
async function applyUpdate() {
  $('#update-banner').textContent = 'Updating…';
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    await reg?.update();
    // drop the cached app files (not the offline map tiles; stars/notes live elsewhere)
    for (const k of await caches.keys()) if (k !== 'lpsa-tiles') await caches.delete(k);
  } catch {}
  location.reload();
}
function setupUpdates() {
  serverVersion().then((v) => { appVersion = v; $('#app-version').textContent = v; }).catch(() => {});
  $('#update-banner').onclick = applyUpdate;
  $('#btn-update').onclick = () => checkForUpdate(true);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && checkForUpdate());
  setTimeout(checkForUpdate, 5000);
}

// iOS: after the keyboard closes the page can stay scrolled up (fixed panels drift off-screen)
document.addEventListener('focusout', (e) => {
  if (e.target.matches('input, textarea')) setTimeout(() => window.scrollTo(0, 0), 50);
});

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
setupUpdates();
start();
