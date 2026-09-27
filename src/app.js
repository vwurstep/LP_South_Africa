/* Wiring: loads data, builds filters/search, connects map <-> sheet, add-place flow. */
import * as data from './data.js';
import { createMap, countTiles, downloadTiles } from './map.js';
import { createSheet } from './sheet.js';

const $ = (s) => document.querySelector(s);
const FILTER_KEY = 'lp.filters';
let guide, mapView, sheet;
let active = new Set(JSON.parse(localStorage.getItem(FILTER_KEY) || 'null') || ['sight', 'activity', 'eat', 'drink', 'sleep', 'shop', 'mine']);
let favOnly = false;

// ---- unlock ------------------------------------------------------------------
async function start() {
  try { guide = await data.loadGuide(); boot(); }
  catch (e) { showUnlock(e.message === 'bad-passphrase'); }
}

function showUnlock(wrong) {
  const dlg = $('#unlock');
  $('#unlock-error').hidden = !wrong;
  dlg.showModal();
  $('#unlock form').onsubmit = async (e) => {
    e.preventDefault();
    try { guide = await data.loadGuide($('#passphrase').value.trim()); dlg.close(); boot(); }
    catch (err) { $('#unlock-error').hidden = false; $('#unlock-error').textContent = err.message === 'bad-passphrase' ? 'Wrong passphrase.' : 'Could not load the guide (offline on first start?).'; }
  };
}

// ---- main ----------------------------------------------------------------------
function allPlaces() { return [...guide.places, ...data.userPlaces()]; }
function placeById(id) { return guide.placeById[id] || data.userPlaces().find((p) => p.id === id); }

function boot() {
  mapView = createMap($('#map'), {
    onPlaceClick: (id) => openPlace(id, false),
    onLongPress: (ll) => openAdd({ lat: ll.lat, lng: ll.lng }),
  });
  sheet = createSheet($('#sheet'), {
    guide,
    onRef: openRef,
    onEditUser: (p) => openAdd(p),
    onClose: () => mapView.select(null),
    onChange: refresh,
  });
  buildChips();
  refresh();
  setupSearch();
  setupMenu();
}

function visible() {
  return allPlaces().filter((p) => active.has(p.category) && (!favOnly || data.annotation(p.id).fav));
}
function refresh() {
  const favs = new Set(allPlaces().filter((p) => data.annotation(p.id).fav).map((p) => p.id));
  mapView.setPlaces(visible(), favs);
}

function openPlace(id, fly = true) {
  const p = placeById(id);
  if (!p) return;
  sheet.open(p);
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

// ---- filter chips -------------------------------------------------------------
function buildChips() {
  const box = $('#chips');
  const cats = ['sight', 'activity', 'eat', 'drink', 'sleep', 'shop', 'info', 'transport', 'mine'];
  box.innerHTML = cats.map((c) => {
    const n = allPlaces().filter((p) => p.category === c).length;
    if (!n && c !== 'mine') return '';
    const k = data.CATEGORIES[c];
    return `<button class="chip ${active.has(c) ? 'on' : ''}" data-cat="${c}" style="--c:${k.color}">${k.label}<small>${n}</small></button>`;
  }).join('') + `<button class="chip fav ${favOnly ? 'on' : ''}" data-fav="1" style="--c:#fab005">★ only</button>`;
  box.onclick = (e) => {
    const b = e.target.closest('.chip'); if (!b) return;
    if (b.dataset.fav) favOnly = !favOnly;
    else active.has(b.dataset.cat) ? active.delete(b.dataset.cat) : active.add(b.dataset.cat);
    localStorage.setItem(FILTER_KEY, JSON.stringify([...active]));
    buildChips(); refresh();
  };
}

// ---- search -------------------------------------------------------------------
function setupSearch() {
  const input = $('#search'), list = $('#results');
  const norm = (s) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
  input.addEventListener('input', () => {
    const q = norm(input.value.trim());
    if (q.length < 2) { list.hidden = true; return; }
    const hits = allPlaces().filter((p) => norm(p.name).includes(q) || norm(p.subcategory || '').includes(q)).slice(0, 30);
    list.innerHTML = hits.map((p) => `<li data-id="${p.id}"><i style="background:${data.CATEGORIES[p.category].color}"></i>${p.name}<small>${p.area || p.subcategory || ''}</small></li>`).join('') || '<li class="muted">No match</li>';
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
    active.add('mine'); buildChips(); refresh();
    openPlace(saved.id);
  };
}

// ---- menu: add, offline, backup, lock -----------------------------------------
function setupMenu() {
  $('#btn-add').onclick = () => openAdd();
  const menu = $('#menu');
  $('#btn-menu').onclick = () => menu.showModal();
  menu.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    if (act === 'close') menu.close();
    if (act === 'offline') {
      const b = mapView.bounds(), n = countTiles(b, 14);
      if (!confirm(`Download ${n} map tiles (about ${Math.round(n * 0.04)} MB) for the visible area?`)) return;
      const out = $('#offline-progress');
      const res = await downloadTiles(b, 14, (d, t) => (out.textContent = `${d} / ${t}`));
      out.textContent = res.failed ? `Done, ${res.failed} failed — try again.` : 'Done — this area works offline.';
    }
    if (act === 'export') {
      const blob = new Blob([JSON.stringify(data.exportUserData(), null, 1)], { type: 'application/json' });
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `my-places-${new Date().toISOString().slice(0, 10)}.json` });
      a.click();
    }
    if (act === 'import') $('#import-file').click();
    if (act === 'lock' && confirm('Forget the passphrase on this device?')) { data.forgetPassphrase(); location.reload(); }
  });
  $('#import-file').onchange = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    data.importUserData(JSON.parse(await file.text()));
    buildChips(); refresh(); menu.close();
  };
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
start();
