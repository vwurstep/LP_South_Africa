/* Map rendering (MapLibre GL + OpenFreeMap vector tiles). Knows the place shape from
   data.js but nothing about panels or storage. */
import { CATEGORIES, SIGHT_TAGS } from './data.js';

export const STYLES = {
  day: 'https://tiles.openfreemap.org/styles/liberty',
  night: 'https://tiles.openfreemap.org/styles/dark',  // same tiles, fonts and sprites as liberty
};
const CAPE_TOWN = { center: [18.45, -33.95], zoom: 11 };
// Adaptive detail: every dot has its own zoom from which it shows as an icon (iz) and with its
// name (lz), computed from the distance to its nearest visible neighbour: a dot expands as soon
// as there is room around it on screen. From ICON_ZOOM / LABEL_ZOOM on, everything expands.
const ICON_ZOOM = 12, LABEL_ZOOM = 14;   // hard cut-offs (all icons / all names)
const ICON_MIN = 5, LABEL_MIN = 6;       // never expand when zoomed out further than this
const ICON_GAP = 26, LABEL_GAP = 64;     // free screen space (px) a dot needs around it
const zoomFor = (gapPx, metres, lat) =>
  Math.log2((gapPx * 40075016.686 * Math.cos((lat * Math.PI) / 180)) / (512 * Math.max(metres, 0.5)));

/** Nearest-neighbour distance (m) for each point, by a latitude sweep. */
function nearestDistances(pts) {
  const order = pts.map((p, i) => i).sort((a, b) => pts[a].lat - pts[b].lat);
  const best = new Array(pts.length).fill(Infinity);
  const M_LAT = 110574;
  for (let oi = 0; oi < order.length; oi++) {
    const i = order[oi], a = pts[i], mLng = 111320 * Math.cos((a.lat * Math.PI) / 180);
    for (const dir of [1, -1]) {
      for (let oj = oi + dir; oj >= 0 && oj < order.length; oj += dir) {
        const b = pts[order[oj]], dy = (b.lat - a.lat) * M_LAT;
        if (Math.abs(dy) >= best[i]) break;
        const d = Math.hypot((b.lng - a.lng) * mLng, dy);
        if (d < best[i]) best[i] = d;
      }
    }
  }
  return best;
}

/** Category pin images (disc + icon + coloured ring), drawn once per theme at the screen's
    pixel density. The emoji is centred on its measured outline, not on the text line:
    emoji fonts (Apple Color Emoji especially) sit off-centre with textBaseline 'middle'. */
function addPinImages(map, night) {
  const r = Math.min(3, Math.max(2, Math.round(window.devicePixelRatio || 2)));
  const S = 32 * r;  // 32 css px
  const pins = [...Object.entries(CATEGORIES).map(([cat, { color, emoji }]) => [cat, color, emoji]),
                ...Object.entries(SIGHT_TAGS).map(([t, { emoji }]) => ['sight-' + t, CATEGORIES.sight.color, emoji])];
  for (const [cat, color, emoji] of pins) {
    const c = document.createElement('canvas'); c.width = c.height = S;
    const x = c.getContext('2d');
    x.beginPath(); x.arc(S / 2, S / 2, S / 2 - 2 * r, 0, Math.PI * 2);
    x.fillStyle = night ? '#1d242c' : '#fff'; x.fill();
    x.lineWidth = 3 * r; x.strokeStyle = color; x.stroke();
    x.font = `${14 * r}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
    x.textAlign = 'left'; x.textBaseline = 'alphabetic';
    const e = emoji || '•', m = x.measureText(e);
    const w = m.actualBoundingBoxLeft + m.actualBoundingBoxRight, h = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
    x.fillText(e, (S - w) / 2 + m.actualBoundingBoxLeft, (S - h) / 2 + m.actualBoundingBoxAscent);
    const id = 'pin-' + cat;
    if (map.hasImage(id)) map.removeImage(id);
    map.addImage(id, x.getImageData(0, 0, S, S), { pixelRatio: r });
  }
}

export function createMap(el, { onPlaceClick, onLongPress, onView, onLocate, theme = 'day' }) {
  let view = CAPE_TOWN;
  try { view = JSON.parse(localStorage.getItem('lp.view')) || CAPE_TOWN; } catch {}
  let current = theme;
  const map = new maplibregl.Map({ container: el, style: STYLES[current], ...view, attributionControl: false });
  map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');
  map.on('moveend', () => {
    try { localStorage.setItem('lp.view', JSON.stringify({ center: map.getCenter().toArray(), zoom: map.getZoom() })); } catch {}
  });
  map.on('rotate', () => onView?.({ bearing: map.getBearing(), pitch: map.getPitch() }));
  map.on('pitch', () => onView?.({ bearing: map.getBearing(), pitch: map.getPitch() }));

  // location: MapLibre's control does the work (blue dot, following); its own button is hidden
  // and the app shows its own button
  const geolocate = new maplibregl.GeolocateControl({
    positionOptions: { enableHighAccuracy: true }, trackUserLocation: true, showAccuracyCircle: true,
  });
  map.addControl(geolocate, 'top-right');
  let lastFix = null;
  geolocate.on('geolocate', (e) => { lastFix = { lat: e.coords.latitude, lng: e.coords.longitude }; onLocate?.('fix', lastFix); });
  geolocate.on('trackuserlocationstart', () => onLocate?.('following'));
  geolocate.on('trackuserlocationend', () => onLocate?.('idle'));
  geolocate.on('userlocationlostfocus', () => onLocate?.('idle'));
  geolocate.on('userlocationfocus', () => onLocate?.('following'));
  geolocate.on('error', () => onLocate?.('error'));

  const empty = { type: 'FeatureCollection', features: [] };
  const isPoly = ['match', ['geometry-type'], ['Polygon', 'MultiPolygon'], true, false];
  const isPoint = ['==', ['get', 'kind'], 'point'];

  // our sources/layers live inside the style, so they are (re-)added on every style load
  function addLayers() {
    const night = current === 'night';
    const halo = night ? '#0d1117' : '#fff';
    addPinImages(map, night);
    map.addSource('shapes', { type: 'geojson', data: empty });
    map.addSource('places', { type: 'geojson', data: empty });
    // areas: faint fill + dashed outline; routes: solid line
    map.addLayer({ id: 'shape-fill', type: 'fill', source: 'shapes', filter: isPoly,
      paint: { 'fill-color': ['get', 'color'], 'fill-opacity': ['case', ['get', 'sel'], night ? 0.3 : 0.22, night ? 0.1 : 0.06] } });
    map.addLayer({ id: 'shape-outline', type: 'line', source: 'shapes', filter: isPoly,
      paint: { 'line-color': ['get', 'color'], 'line-width': ['case', ['get', 'sel'], 3, 1.5], 'line-dasharray': [3, 2], 'line-opacity': 0.8 } });
    map.addLayer({ id: 'route-line', type: 'line', source: 'shapes', filter: ['!', isPoly],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': ['get', 'color'], 'line-width': ['case', ['get', 'sel'], 7, 4.5], 'line-opacity': night ? 0.9 : 0.75 } });
    map.addLayer({ id: 'area-label', type: 'symbol', source: 'places', minzoom: 10.5, filter: ['!', isPoint],
      layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Italic'], 'text-size': 13, 'text-max-width': 8 },
      paint: { 'text-color': ['get', 'color'], 'text-halo-color': halo, 'text-halo-width': 1.8 } });
    const expanded = ['>=', ['zoom'], ['get', 'iz']], named = ['>=', ['zoom'], ['get', 'lz']];
    const selColor = night ? '#ffb224' : '#212529';
    // selection ring hugging whatever is shown: a small dot, or the icon disc
    map.addLayer({ id: 'selected-dot', type: 'circle', source: 'places', filter: ['==', ['get', 'id'], ''],
      paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, ['case', ['get', 'top'], 6.5, 5], 12, ['case', ['get', 'top'], 9.5, 7.5]],
               'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': selColor, 'circle-stroke-width': 2 } });
    map.addLayer({ id: 'selected-icon', type: 'circle', source: 'places', filter: ['==', ['get', 'id'], ''],
      paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], ICON_MIN, 12.5, ICON_ZOOM, 13.5, 16, 18],
               'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': selColor, 'circle-stroke-width': 2.5 } });
    // not (yet) expanded: small dots
    map.addLayer({ id: 'places-dot', type: 'circle', source: 'places', filter: ['all', isPoint, ['!', expanded]],
      paint: {
        'circle-color': ['get', 'color'],
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, ['case', ['get', 'top'], 4, 2.5], 12, ['case', ['get', 'top'], 7, 5]],
        'circle-stroke-color': ['case', ['get', 'fav'], '#ffd43b', ['get', 'rec'], night ? '#e9eef3' : '#212529', halo],
        'circle-stroke-width': ['case', ['get', 'fav'], 2.5, ['get', 'rec'], 2, 1],
      } });
    // expanded: ring for favourites / friend tips, then the icon disc on top
    map.addLayer({ id: 'places-ring', type: 'circle', source: 'places',
      filter: ['all', isPoint, expanded, ['any', ['get', 'fav'], ['get', 'rec']]],
      paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], ICON_MIN, 11.5, ICON_ZOOM, 12.5, 16, 17], 'circle-color': 'rgba(0,0,0,0)',
               'circle-stroke-color': ['case', ['get', 'fav'], '#ffd43b', night ? '#e9eef3' : '#212529'], 'circle-stroke-width': 3 } });
    // names: where there's room (lz), still de-cluttered by MapLibre's label collision; top sights win
    map.addLayer({ id: 'places-label', type: 'symbol', source: 'places', filter: ['all', isPoint, named],
      layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Bold'], 'text-size': 12,
                // below the pin if there's room, otherwise beside or above it
                'text-variable-anchor': ['top', 'right', 'left', 'bottom'], 'text-radial-offset': 1.75, 'text-justify': 'auto',
                'text-max-width': 9, 'text-optional': true, 'text-padding': 1,
                'symbol-sort-key': ['case', ['get', 'top'], 0, ['get', 'fav'], 1, 2] },
      paint: { 'text-color': night ? '#e9eef3' : '#212529', 'text-halo-color': halo, 'text-halo-width': 1.5 } });
    map.addLayer({ id: 'places-icon', type: 'symbol', source: 'places', filter: ['all', isPoint, expanded],
      layout: { 'icon-image': ['concat', 'pin-', ['get', 'pin']], 'icon-size': ['interpolate', ['linear'], ['zoom'], ICON_MIN, 0.75, ICON_ZOOM, 0.8, 16, 1.1],
                'icon-allow-overlap': true, 'icon-ignore-placement': false, 'icon-padding': 0,  // always shown; names avoid them
                'symbol-sort-key': ['case', ['get', 'top'], 0, 1] } });
    if (!shapesOn) ['shape-fill', 'shape-outline', 'route-line', 'area-label'].forEach((l) => map.setLayoutProperty(l, 'visibility', 'none'));
    setSelectionFilter();
    render();
  }
  let shapesOn = true;
  const ready = new Promise((res) => map.once('load', res));
  map.on('style.load', addLayers);
  ready.then(() => {
    map.on('click', onClick);
    // start with the credit collapsed to the (i) button; tap it to read it
    el.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');
  });

  // dots win over routes, routes over areas; overlapping areas -> smallest first
  const box = (p, r) => [[p.x - r, p.y - r], [p.x + r, p.y + r]];
  function onClick(e) {
    const dot = map.queryRenderedFeatures(box(e.point, 12), { layers: ['places-icon', 'places-dot', 'area-label'] })[0];
    if (dot) return onPlaceClick(dot.properties.id, []);
    const route = map.queryRenderedFeatures(box(e.point, 8), { layers: ['route-line'] })[0];
    if (route) return onPlaceClick(route.properties.id, []);
    const areas = map.queryRenderedFeatures(e.point, { layers: ['shape-fill'] })
      .sort((a, b) => a.properties.size - b.properties.size);
    const ids = [...new Set(areas.map((f) => f.properties.id))];
    if (ids.length) onPlaceClick(ids[0], ids.slice(1));
  }
  for (const l of ['places-dot', 'places-icon']) {
    map.on('mouseenter', l, () => (map.getCanvas().style.cursor = 'pointer'));
    map.on('mouseleave', l, () => (map.getCanvas().style.cursor = ''));
  }

  // long-press (touch) and right-click (desktop) to add a place
  map.on('contextmenu', (e) => onLongPress(e.lngLat));
  let timer = null, start = null;
  map.on('touchstart', (e) => {
    if (e.originalEvent.touches.length !== 1) return;
    start = e.point;
    timer = setTimeout(() => onLongPress(e.lngLat), 600);
  });
  const cancel = () => clearTimeout(timer);
  map.on('touchend', cancel);
  map.on('touchcancel', cancel);
  map.on('touchmove', (e) => { if (start && Math.hypot(e.point.x - start.x, e.point.y - start.y) > 8) cancel(); });
  map.on('movestart', cancel);

  let selectedId = null, lastPlaces = [], lastFavs = new Set(), detail = new Map();
  function setSelectionFilter() {
    if (!map.getLayer('selected-dot')) return;
    const isSel = ['==', ['get', 'id'], selectedId || ''], expanded = ['>=', ['zoom'], ['get', 'iz']];
    map.setFilter('selected-dot', ['all', isSel, ['==', ['get', 'kind'], 'point'], ['!', expanded]]);
    map.setFilter('selected-icon', ['all', isSel, ['==', ['get', 'kind'], 'point'], expanded]);
  }
  function computeDetail() {  // per visible point: zoom to show the icon (iz) and the name (lz)
    const pts = lastPlaces.filter((p) => (p.kind || 'point') === 'point');
    const near = nearestDistances(pts);
    detail = new Map(pts.map((p, i) => {
      const iz = Math.min(ICON_ZOOM, Math.max(ICON_MIN, zoomFor(ICON_GAP, near[i], p.lat)));
      const lz = Math.min(LABEL_ZOOM, Math.max(LABEL_MIN, iz, zoomFor(LABEL_GAP, near[i], p.lat)));
      return [p.id, { iz: +iz.toFixed(2), lz: +lz.toFixed(2) }];
    }));
  }
  function bboxSize(g) {
    const flat = g.coordinates.flat(3);
    let x0 = 180, x1 = -180, y0 = 90, y1 = -90;
    for (let i = 0; i < flat.length; i += 2) { x0 = Math.min(x0, flat[i]); x1 = Math.max(x1, flat[i]); y0 = Math.min(y0, flat[i + 1]); y1 = Math.max(y1, flat[i + 1]); }
    return (x1 - x0) * (y1 - y0);
  }
  function render() {
    const places = map.getSource('places'), shapes = map.getSource('shapes');
    if (!places || !shapes) return;  // style still loading; addLayers renders when done
    const color = (p) => CATEGORIES[p.category]?.color || '#000';
    places.setData({
      type: 'FeatureCollection',
      features: lastPlaces.map((p) => ({
        type: 'Feature', geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
        properties: { id: p.id, name: p.name, kind: p.kind || 'point', top: !!p.top, fav: lastFavs.has(p.id),
          rec: !!p.recs?.some((r) => r.type !== 'web'), color: color(p), cat: CATEGORIES[p.category] ? p.category : 'info',
          pin: p.category === 'sight' && SIGHT_TAGS[p.tags?.[0]] ? 'sight-' + p.tags[0] : (CATEGORIES[p.category] ? p.category : 'info'),
          iz: detail.get(p.id)?.iz ?? ICON_ZOOM, lz: detail.get(p.id)?.lz ?? LABEL_ZOOM },
      })),
    });
    shapes.setData({
      type: 'FeatureCollection',
      features: lastPlaces.filter((p) => p.shape).map((p) => ({
        type: 'Feature', geometry: p.shape,
        properties: { id: p.id, color: color(p), sel: p.id === selectedId, size: bboxSize(p.shape) },
      })),
    });
  }

  return {
    map,
    ready,
    setPlaces(places, favs) { lastPlaces = places; lastFavs = favs; computeDetail(); ready.then(render); },
    select(id) {
      selectedId = id;
      ready.then(() => { setSelectionFilter(); render(); });
    },
    showShapes(on) {
      shapesOn = on;
      ready.then(() => ['shape-fill', 'shape-outline', 'route-line', 'area-label']
        .forEach((l) => map.getLayer(l) && map.setLayoutProperty(l, 'visibility', on ? 'visible' : 'none')));
    },
    /** 'day' | 'night': swaps the base map; our layers are re-added on style.load */
    setTheme(t) {
      if (t === current) return;
      current = t;
      map.setStyle(STYLES[t], { diff: false });
    },
    flyTo(p, offsetY = 0) {
      if (p.shape && p.kind !== 'point') {
        const flat = p.shape.coordinates.flat(3), xs = flat.filter((_, i) => i % 2 === 0), ys = flat.filter((_, i) => i % 2);
        map.fitBounds([[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]],
          { padding: { top: 120, bottom: offsetY * 2 + 20, left: 30, right: 30 }, maxZoom: 15 });
      } else map.flyTo({ center: [p.lng, p.lat], zoom: Math.max(map.getZoom(), 15), offset: [0, -offsetY] });
    },
    fitPlaces(places) {
      if (!places.length) return;
      const xs = places.map((p) => p.lng), ys = places.map((p) => p.lat);
      map.fitBounds([[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]], { padding: 60, maxZoom: 14 });
    },
    locate() { geolocate.trigger(); },
    resetNorth() { map.easeTo({ bearing: 0, pitch: 0 }); },
    lastFix: () => lastFix,
    center() { const c = map.getCenter(); return { lat: c.lat, lng: c.lng }; },
    bounds() { return map.getBounds(); },
  };
}

// ---- offline tiles -----------------------------------------------------------
function tileRange(b, z) {
  const n = 2 ** z;
  const x = (lng) => Math.floor(((lng + 180) / 360) * n);
  const y = (lat) => { const r = (lat * Math.PI) / 180; return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n); };
  return { x0: x(b.getWest()), x1: x(b.getEast()), y0: y(b.getNorth()), y1: y(b.getSouth()) };
}

export function countTiles(bounds, maxZoom = 14) {
  let n = 0;
  for (let z = 0; z <= maxZoom; z++) { const r = tileRange(bounds, z); n += (r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1); }
  return n;
}

/** Fetch every tile in bounds up to maxZoom (the service worker stores them). */
export async function downloadTiles(bounds, maxZoom, onProgress) {
  const style = await (await fetch(STYLES.day, { cache: 'reload' })).json();
  await fetch(STYLES.night, { cache: 'reload' });  // night map: same tiles/fonts/sprites
  const tilejson = await (await fetch(style.sources.openmaptiles.url, { cache: 'reload' })).json();
  const tpl = tilejson.tiles[0];
  const urls = [];
  for (let z = 0; z <= maxZoom; z++) {
    const r = tileRange(bounds, z);
    for (let x = r.x0; x <= r.x1; x++) for (let y = r.y0; y <= r.y1; y++)
      urls.push(tpl.replace('{z}', z).replace('{x}', x).replace('{y}', y));
  }
  // fonts + sprite used by the style
  for (const f of ['Noto Sans Regular', 'Noto Sans Bold', 'Noto Sans Italic'])
    for (const range of ['0-255', '256-511', '8192-8447'])
      urls.push(style.glyphs.replace('{fontstack}', encodeURIComponent(f)).replace('{range}', range));
  for (const s of ['', '@2x']) for (const ext of ['.json', '.png']) urls.push(style.sprite + s + ext);

  let done = 0, failed = 0;
  const queue = urls.slice();
  async function worker() {
    while (queue.length) {
      const u = queue.shift();
      try { const r = await fetch(u); if (!r.ok) failed++; } catch { failed++; }
      onProgress(++done, urls.length);
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker));
  return { total: urls.length, failed };
}
