/* Data access layer. No DOM, no map code: any frontend (this app, a website later)
   can use it. Guide data = encrypted data/guide.enc.json (schema in CLAUDE.md).
   User data (own places, favourites, notes) = localStorage on this device, optionally
   synced (encrypted) to a GitHub branch so it survives phone loss and Claude can read it. */

export const CATEGORIES = {
  sight:     { label: 'Sights',    color: '#d9480f' },
  activity:  { label: 'Do',        color: '#2f9e44' },
  eat:       { label: 'Eat',       color: '#c2255c' },
  drink:     { label: 'Drink',     color: '#7048e8' },
  sleep:     { label: 'Sleep',     color: '#1971c2' },
  shop:      { label: 'Shop',      color: '#e67700' },
  area:      { label: 'Areas',     color: '#0c8599' },
  info:      { label: 'Info',      color: '#495057' },
  transport: { label: 'Transport', color: '#495057' },
  mine:      { label: 'Mine',      color: '#f08c00' },
};

const PASS_KEY = 'lp.passphrase';
const USER_KEY = 'lp.user.places';
const ANNO_KEY = 'lp.user.annotations'; // { placeId: { fav, note, updated } }
const TOMB_KEY = 'lp.user.deleted';     // { placeId: deletedAt } so deletions sync too
const SYNC_KEY = 'lp.sync';             // { token, repo, branch, path, last }

function read(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function write(key, value) { localStorage.setItem(key, JSON.stringify(value)); }

// ---- crypto (same format as tools/encrypt.mjs) -------------------------------
const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
function toB64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
async function deriveKey(passphrase, salt, iter, usage) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter },
    base, { name: 'AES-GCM', length: 256 }, false, [usage]);
}
async function decryptJSON(enc, passphrase) {
  const key = await deriveKey(passphrase, fromB64(enc.salt), enc.iter, 'decrypt');
  const buf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(enc.iv) }, key, fromB64(enc.ct));
  const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
  return JSON.parse(await new Response(stream).text());
}
async function encryptJSON(obj, passphrase) {
  const iter = 250000;
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const gz = new Uint8Array(await new Response(new Blob([JSON.stringify(obj)]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
  const key = await deriveKey(passphrase, salt, iter, 'encrypt');
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, gz));
  return { v: 1, gzip: true, iter, salt: toB64(salt), iv: toB64(iv), ct: toB64(ct) };
}

// ---- guide -----------------------------------------------------------------
export function savedPassphrase() { return localStorage.getItem(PASS_KEY); }
export function forgetPassphrase() { localStorage.removeItem(PASS_KEY); }

/** Load the guide. Throws 'bad-passphrase' if it cannot be decrypted. */
export async function loadGuide(passphrase = savedPassphrase(), url = 'data/guide.enc.json') {
  if (!passphrase) throw new Error('no-passphrase');
  const enc = await (await fetch(url)).json();
  let guide;
  try { guide = await decryptJSON(enc, passphrase); } catch { throw new Error('bad-passphrase'); }
  localStorage.setItem(PASS_KEY, passphrase);
  guide.sectionById = Object.fromEntries(guide.sections.map((s) => [s.id, s]));
  guide.chapterById = Object.fromEntries((guide.meta.chapters || []).map((c) => [c.id, c]));
  for (const p of guide.places) p.country = guide.chapterById[p.chapter]?.country;
  guide.placeById = Object.fromEntries(guide.places.map((p) => [p.id, p]));
  return guide;
}

// ---- user places -----------------------------------------------------------
const listeners = new Set();
/** Called after any local change to user data (used to trigger sync). */
export function onUserDataChange(fn) { listeners.add(fn); }
const changed = () => listeners.forEach((fn) => fn());

export function userPlaces() { return read(USER_KEY, []); }

export function saveUserPlace(place) {
  const list = userPlaces();
  const p = { category: 'mine', kind: 'point', source: 'mine', ...place, user: true,
    id: place.id || 'u-' + Date.now().toString(36), updated: Date.now() };
  const i = list.findIndex((q) => q.id === p.id);
  if (i >= 0) list[i] = p; else list.push(p);
  write(USER_KEY, list);
  changed();
  return p;
}

export function deleteUserPlace(id) {
  write(USER_KEY, userPlaces().filter((p) => p.id !== id));
  write(TOMB_KEY, { ...read(TOMB_KEY, {}), [id]: Date.now() });
  changed();
}

// ---- annotations on any place (guide or user) ------------------------------
export function annotation(id) { return read(ANNO_KEY, {})[id] || {}; }
export function setAnnotation(id, patch) {
  const all = read(ANNO_KEY, {});
  all[id] = { ...all[id], ...patch, updated: Date.now() };
  write(ANNO_KEY, all);
  changed();
  return all[id];
}

// ---- backup / merge ----------------------------------------------------------
export function exportUserData() {
  return { v: 2, exported: new Date().toISOString(), places: userPlaces(), annotations: read(ANNO_KEY, {}), deleted: read(TOMB_KEY, {}) };
}

/** Merge another copy of the user data into this device (newest change wins). */
export function importUserData(data) {
  const tomb = { ...read(TOMB_KEY, {}) };
  for (const [id, t] of Object.entries(data.deleted || {})) tomb[id] = Math.max(tomb[id] || 0, t);
  const byId = Object.fromEntries(userPlaces().map((p) => [p.id, p]));
  for (const p of data.places || []) if (!byId[p.id] || (p.updated || 0) > (byId[p.id].updated || 0)) byId[p.id] = p;
  const places = Object.values(byId).filter((p) => !(tomb[p.id] >= (p.updated || 0)));
  const anno = { ...read(ANNO_KEY, {}) };
  for (const [id, a] of Object.entries(data.annotations || {})) if (!anno[id] || (a.updated || 0) > (anno[id].updated || 0)) anno[id] = a;
  write(USER_KEY, places); write(ANNO_KEY, anno); write(TOMB_KEY, tomb);
}

// ---- GitHub sync -----------------------------------------------------------------
export function syncSettings() { return read(SYNC_KEY, null); }
export function setSyncSettings(s) { s ? write(SYNC_KEY, s) : localStorage.removeItem(SYNC_KEY); }

async function gh(s, method, body) {
  const url = `https://api.github.com/repos/${s.repo}/contents/${s.path}` + (method === 'GET' ? `?ref=${s.branch}&t=${Date.now()}` : '');
  return fetch(url, { method, body: body && JSON.stringify(body), cache: 'no-store',
    headers: { Authorization: `Bearer ${s.token}`, Accept: 'application/vnd.github+json' } });
}

/** Pull remote copy, merge, push merged copy. Returns a status string. */
export async function sync() {
  const s = syncSettings(), pass = savedPassphrase();
  if (!s?.token || !pass) return 'off';
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await gh(s, 'GET');
    let sha;
    if (res.ok) {
      const file = await res.json();
      sha = file.sha;
      importUserData(await decryptJSON(JSON.parse(atob(file.content.replace(/\n/g, ''))), pass));
    } else if (res.status !== 404) throw new Error(`GitHub ${res.status}`);
    const enc = await encryptJSON(exportUserData(), pass);
    const put = await gh(s, 'PUT', { message: 'Sync user data', branch: s.branch, sha,
      content: btoa(JSON.stringify(enc)) });
    if (put.ok) { setSyncSettings({ ...s, last: Date.now() }); return 'ok'; }
    if (put.status !== 409 && put.status !== 422) throw new Error(`GitHub ${put.status}`);
    // someone else wrote in between: pull again and retry
  }
  throw new Error('conflict');
}

// ---- parse coordinates from text / Google Maps URLs ------------------------
export function parseLocation(text) {
  const t = decodeURIComponent(text || '');
  const pats = [
    /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/,              // place data in google URLs (most exact)
    /@(-?\d+\.\d+),\s*(-?\d+\.\d+)/,               // .../@lat,lng,17z
    /[?&](?:q|query|ll|center|destination)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/,
    /(-?\d{1,2}\.\d+)\s*[, ]\s*(-?\d{1,3}\.\d+)/,  // plain "lat, lng"
  ];
  for (const re of pats) {
    const m = t.match(re);
    if (m) {
      const lat = +m[1], lng = +m[2];
      if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
        const name = (t.match(/\/place\/([^/@]+)/) || [])[1];
        return { lat, lng, name: name ? name.replace(/\+/g, ' ') : null };
      }
    }
  }
  return null;
}

/** Google Maps link for a place: its own Google page when known, else a name search. */
export function googleMapsUrl(p) {
  if (p.google?.uri) return p.google.uri;
  const q = p.user ? `${p.lat},${p.lng}` : [p.name, p.locality, p.country].filter(Boolean).join(', ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` +
    (p.google?.id ? `&query_place_id=${p.google.id}` : '');
}
