/* Data access layer. No DOM, no map code: any frontend (this app, a website later)
   can use it. Guide data = encrypted data/guide.enc.json (schema in CLAUDE.md).
   User data (own places, favourites, notes) = localStorage on this device. */

export const CATEGORIES = {
  sight:     { label: 'Sights',    color: '#d9480f', icon: '★' },
  activity:  { label: 'Do',        color: '#2f9e44', icon: '▲' },
  eat:       { label: 'Eat',       color: '#c2255c', icon: '●' },
  drink:     { label: 'Drink',     color: '#7048e8', icon: '◆' },
  sleep:     { label: 'Sleep',     color: '#1971c2', icon: '■' },
  shop:      { label: 'Shop',      color: '#e67700', icon: '♦' },
  info:      { label: 'Info',      color: '#495057', icon: 'i' },
  transport: { label: 'Transport', color: '#495057', icon: '→' },
  mine:      { label: 'Mine',      color: '#f08c00', icon: '♥' },
};

const PASS_KEY = 'lp.passphrase';
const USER_KEY = 'lp.user.places';
const ANNO_KEY = 'lp.user.annotations'; // { placeId: { fav, note } }

function read(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function write(key, value) { localStorage.setItem(key, JSON.stringify(value)); }

// ---- guide -----------------------------------------------------------------
const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function decryptGuide(enc, passphrase) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: b64(enc.salt), iterations: enc.iter },
    base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  const buf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(enc.iv) }, key, b64(enc.ct));
  const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
  return JSON.parse(await new Response(stream).text());
}

export function savedPassphrase() { return localStorage.getItem(PASS_KEY); }
export function forgetPassphrase() { localStorage.removeItem(PASS_KEY); }

/** Load the guide. Throws 'bad-passphrase' if it cannot be decrypted. */
export async function loadGuide(passphrase = savedPassphrase(), url = 'data/guide.enc.json') {
  if (!passphrase) throw new Error('no-passphrase');
  const enc = await (await fetch(url)).json();
  let guide;
  try { guide = await decryptGuide(enc, passphrase); } catch { throw new Error('bad-passphrase'); }
  localStorage.setItem(PASS_KEY, passphrase);
  guide.sectionById = Object.fromEntries(guide.sections.map((s) => [s.id, s]));
  guide.placeById = Object.fromEntries(guide.places.map((p) => [p.id, p]));
  return guide;
}

// ---- user places -----------------------------------------------------------
export function userPlaces() { return read(USER_KEY, []); }

export function saveUserPlace(place) {
  const list = userPlaces();
  const p = { category: 'mine', ...place, user: true, id: place.id || 'u-' + Date.now().toString(36) };
  const i = list.findIndex((q) => q.id === p.id);
  if (i >= 0) list[i] = p; else list.push(p);
  write(USER_KEY, list);
  return p;
}

export function deleteUserPlace(id) { write(USER_KEY, userPlaces().filter((p) => p.id !== id)); }

// ---- annotations on any place (guide or user) ------------------------------
export function annotation(id) { return read(ANNO_KEY, {})[id] || {}; }
export function setAnnotation(id, patch) {
  const all = read(ANNO_KEY, {});
  all[id] = { ...all[id], ...patch };
  write(ANNO_KEY, all);
  return all[id];
}

// ---- backup ----------------------------------------------------------------
export function exportUserData() {
  return { v: 1, exported: new Date().toISOString(), places: userPlaces(), annotations: read(ANNO_KEY, {}) };
}
export function importUserData(data) {
  const byId = Object.fromEntries(userPlaces().map((p) => [p.id, p]));
  for (const p of data.places || []) byId[p.id] = p;
  write(USER_KEY, Object.values(byId));
  write(ANNO_KEY, { ...read(ANNO_KEY, {}), ...(data.annotations || {}) });
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
