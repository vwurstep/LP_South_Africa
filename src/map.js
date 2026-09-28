/* Map rendering (MapLibre GL + OpenFreeMap vector tiles). Knows the place shape from
   data.js but nothing about panels or storage. */
import { CATEGORIES } from './data.js';

const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
const CAPE_TOWN = { center: [18.45, -33.95], zoom: 11 };

export function createMap(el, { onPlaceClick, onLongPress }) {
  let view = CAPE_TOWN;
  try { view = JSON.parse(localStorage.getItem('lp.view')) || CAPE_TOWN; } catch {}
  const map = new maplibregl.Map({
    container: el, style: STYLE_URL, ...view, attributionControl: { compact: true },
  });
  map.on('moveend', () => {
    try { localStorage.setItem('lp.view', JSON.stringify({ center: map.getCenter().toArray(), zoom: map.getZoom() })); } catch {}
  });
  map.addControl(new maplibregl.NavigationControl({ showZoom: false, visualizePitch: false }), 'top-right');
  const geolocate = new maplibregl.GeolocateControl({
    positionOptions: { enableHighAccuracy: true }, trackUserLocation: true, showAccuracyCircle: true,
  });
  map.addControl(geolocate, 'top-right');
  const empty = { type: 'FeatureCollection', features: [] };
  const isPoly = ['match', ['geometry-type'], ['Polygon', 'MultiPolygon'], true, false];

  const ready = new Promise((res) => map.on('load', res));
  ready.then(() => {
    map.addSource('shapes', { type: 'geojson', data: empty });
    map.addSource('places', { type: 'geojson', data: empty });
    // areas: faint fill + dashed outline; routes: solid line
    map.addLayer({ id: 'shape-fill', type: 'fill', source: 'shapes', filter: isPoly,
      paint: { 'fill-color': ['get', 'color'], 'fill-opacity': ['case', ['get', 'sel'], 0.22, 0.06] } });
    map.addLayer({ id: 'shape-outline', type: 'line', source: 'shapes', filter: isPoly,
      paint: { 'line-color': ['get', 'color'], 'line-width': ['case', ['get', 'sel'], 3, 1.5], 'line-dasharray': [3, 2], 'line-opacity': 0.8 } });
    map.addLayer({ id: 'route-line', type: 'line', source: 'shapes', filter: ['!', isPoly],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': ['get', 'color'], 'line-width': ['case', ['get', 'sel'], 7, 4.5], 'line-opacity': 0.75 } });
    map.addLayer({ id: 'area-label', type: 'symbol', source: 'places', minzoom: 10.5,
      filter: ['!=', ['get', 'kind'], 'point'],
      layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Italic'], 'text-size': 13, 'text-max-width': 8 },
      paint: { 'text-color': ['get', 'color'], 'text-halo-color': '#fff', 'text-halo-width': 1.8 } });
    map.addLayer({ id: 'selected', type: 'circle', source: 'places', filter: ['==', ['get', 'id'], ''],
      paint: { 'circle-radius': 16, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': '#212529', 'circle-stroke-width': 3 } });
    map.addLayer({
      id: 'places-dot', type: 'circle', source: 'places', filter: ['==', ['get', 'kind'], 'point'],
      paint: {
        'circle-color': ['get', 'color'],
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, ['case', ['get', 'top'], 6, 4], 15, ['case', ['get', 'top'], 11, 8]],
        'circle-stroke-color': ['case', ['get', 'fav'], '#ffd43b', ['get', 'rec'], '#212529', '#ffffff'],
        'circle-stroke-width': ['case', ['get', 'fav'], 3, ['get', 'rec'], 2.5, 1.5],
      },
    });
    map.addLayer({
      id: 'places-label', type: 'symbol', source: 'places', minzoom: 14, filter: ['==', ['get', 'kind'], 'point'],
      layout: {
        'text-field': ['get', 'name'], 'text-font': ['Noto Sans Bold'], 'text-size': 12,
        'text-offset': [0, 1.1], 'text-anchor': 'top', 'text-max-width': 9, 'text-optional': true,
      },
      paint: { 'text-color': '#212529', 'text-halo-color': '#fff', 'text-halo-width': 1.5 },
    });
    map.on('click', onClick);
  });

  // dots win over routes, routes over areas; overlapping areas -> smallest first
  const box = (p, r) => [[p.x - r, p.y - r], [p.x + r, p.y + r]];
  function onClick(e) {
    const dot = map.queryRenderedFeatures(box(e.point, 10), { layers: ['places-dot', 'area-label'] })[0];
    if (dot) return onPlaceClick(dot.properties.id, []);
    const route = map.queryRenderedFeatures(box(e.point, 8), { layers: ['route-line'] })[0];
    if (route) return onPlaceClick(route.properties.id, []);
    const areas = map.queryRenderedFeatures(e.point, { layers: ['shape-fill'] })
      .sort((a, b) => a.properties.size - b.properties.size);
    const ids = [...new Set(areas.map((f) => f.properties.id))];
    if (ids.length) onPlaceClick(ids[0], ids.slice(1));
  }
  map.on('mouseenter', 'places-dot', () => (map.getCanvas().style.cursor = 'pointer'));
  map.on('mouseleave', 'places-dot', () => (map.getCanvas().style.cursor = ''));

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

  let selectedId = null, lastPlaces = [], lastFavs = new Set();
  function bboxSize(g) {
    const flat = g.coordinates.flat(3);
    let x0 = 180, x1 = -180, y0 = 90, y1 = -90;
    for (let i = 0; i < flat.length; i += 2) { x0 = Math.min(x0, flat[i]); x1 = Math.max(x1, flat[i]); y0 = Math.min(y0, flat[i + 1]); y1 = Math.max(y1, flat[i + 1]); }
    return (x1 - x0) * (y1 - y0);
  }
  function render() {
    const color = (p) => CATEGORIES[p.category]?.color || '#000';
    map.getSource('places').setData({
      type: 'FeatureCollection',
      features: lastPlaces.map((p) => ({
        type: 'Feature', geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
        properties: { id: p.id, name: p.name, kind: p.kind || 'point', top: !!p.top, fav: lastFavs.has(p.id),
          rec: !!(p.recs?.length), color: color(p) },
      })),
    });
    map.getSource('shapes').setData({
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
    setPlaces(places, favs) { lastPlaces = places; lastFavs = favs; ready.then(render); },
    select(id) {
      selectedId = id;
      ready.then(() => { map.setFilter('selected', ['==', ['get', 'id'], id || '']); render(); });
    },
    showShapes(on) {
      ready.then(() => ['shape-fill', 'shape-outline', 'route-line', 'area-label']
        .forEach((l) => map.setLayoutProperty(l, 'visibility', on ? 'visible' : 'none')));
    },
    flyTo(p, offsetY = 0) {
      if (p.shape && p.kind !== 'point') {
        const flat = p.shape.coordinates.flat(3), xs = flat.filter((_, i) => i % 2 === 0), ys = flat.filter((_, i) => i % 2);
        map.fitBounds([[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]],
          { padding: { top: 120, bottom: offsetY * 2 + 20, left: 30, right: 30 }, maxZoom: 15 });
      } else map.flyTo({ center: [p.lng, p.lat], zoom: Math.max(map.getZoom(), 15), offset: [0, -offsetY] });
    },
    locate() { geolocate.trigger(); },
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
  const style = await (await fetch(STYLE_URL, { cache: 'reload' })).json();
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
