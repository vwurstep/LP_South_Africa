/* Filter model: independent facets ("Show", "Type", "Source"). A place is visible when it
   matches every facet (and ★-only, if on). No DOM here.
   New options appear automatically: facet options are derived from the data (e.g. one
   source option per friend), and options not yet in the saved state start switched on. */
import { CATEGORIES } from './data.js';

const KEY = 'lp.filters.v2';

/** What a place is drawn as: a dot, an outline, a line — possibly several. */
export function kindsOf(p) {
  if (p.user) return ['places'];
  const k = [];
  if ((p.kind || 'point') === 'point') k.push('places');
  if (p.kind === 'route' || p.shape?.type === 'LineString') k.push('routes');
  if (p.kind === 'area') k.push('areas');
  return k;
}

/** Where a place comes from; a book place with a friend's tip has two sources. */
export function sourcesOf(p) {
  if (p.user) return ['mine'];
  const s = new Set();
  if (p.source === 'lp') s.add('lp');
  for (const r of p.recs || []) s.add(r.type === 'web' ? 'web' : `friend:${r.by}`);
  if (p.source === 'web') s.add('web');
  return [...s];
}

export function buildFacets(places) {
  const count = (fn) => { const c = {}; for (const p of places) for (const v of fn(p)) c[v] = (c[v] || 0) + 1; return c; };
  const kinds = count(kindsOf), srcs = count(sourcesOf);
  const types = count((p) => (kindsOf(p).includes('places') && !p.user ? [p.category] : []));
  const friends = Object.keys(srcs).filter((s) => s.startsWith('friend:')).sort();
  return [
    { id: 'kind', label: 'Show', options: [
      { id: 'places', label: 'Places', emoji: '📍', color: '#495057', n: kinds.places || 0 },
      { id: 'areas', label: 'Areas', emoji: '🗺️', color: CATEGORIES.area.color, n: kinds.areas || 0 },
      { id: 'routes', label: 'Routes', emoji: '🛣️', color: '#2b8a3e', n: kinds.routes || 0 },
    ] },
    { id: 'type', label: 'Type of place', note: 'applies to the dots',
      options: Object.keys(CATEGORIES).filter((c) => types[c])
        .map((c) => ({ id: c, label: CATEGORIES[c].label, emoji: CATEGORIES[c].emoji, color: CATEGORIES[c].color, n: types[c] })) },
    { id: 'source', label: 'Source', options: [
      { id: 'lp', label: 'Lonely Planet', emoji: '📘', color: '#1971c2', n: srcs.lp || 0 },
      ...friends.map((f) => ({ id: f, label: f.slice(7), sub: 'friend', emoji: '💬', color: '#495057', n: srcs[f] })),
      ...(srcs.web ? [{ id: 'web', label: 'Road trips', sub: 'web research', emoji: '🌐', color: '#2b8a3e', n: srcs.web }] : []),
      { id: 'mine', label: 'My places', emoji: '❤️', color: CATEGORIES.mine.color, n: srcs.mine || 0 },
    ] },
  ];
}

/** Saved state: { off: {facetId: [optionIds switched off]}, favOnly, routesOnly }.
    favOnly / routesOnly are the quick switches in the floating bar (Saved, Routes). Storing what is OFF
    means options that appear later (a new friend, a new category) start switched on. */
export function loadState() {
  try { return { off: {}, favOnly: false, routesOnly: false, ...JSON.parse(localStorage.getItem(KEY)) }; }
  catch { return { off: {}, favOnly: false, routesOnly: false }; }
}
export function saveState(st) { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch {} }

export const isOn = (st, facet, opt) => !(st.off[facet] || []).includes(opt);
export function setOn(st, facet, opt, on) {
  const off = new Set(st.off[facet] || []);
  on ? off.delete(opt) : off.add(opt);
  st.off[facet] = [...off];
}
export function setAll(st, facets, on, facetId = null) {
  for (const f of facets) if (!facetId || f.id === facetId) st.off[f.id] = on ? [] : f.options.map((o) => o.id);
}
export const activeCount = (st) => Object.values(st.off).reduce((n, a) => n + a.length, 0) + (st.favOnly ? 1 : 0) + (st.routesOnly ? 1 : 0);

/** Predicate for one place under the current state. */
export function matcher(st, isFav) {
  return (p) => {
    if (st.favOnly && !isFav(p.id)) return false;
    if (!sourcesOf(p).some((s) => isOn(st, 'source', s))) return false;
    if (st.routesOnly) return kindsOf(p).includes('routes');  // quick switch: only the lines
    return kindsOf(p).some((k) => isOn(st, 'kind', k) && (k !== 'places' || p.user || isOn(st, 'type', p.category)));
  };
}
