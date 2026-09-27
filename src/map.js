/* Map rendering (MapLibre GL + OpenFreeMap vector tiles). Knows the place shape from
   data.js but nothing about panels or storage. */
import { CATEGORIES } from './data.js';

const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
const CAPE_TOWN = { center: [18.45, -33.95], zoom: 11 };

export function createMap(el, { onPlaceClick, onLongPress }) {
  const map = new maplibregl.Map({
    container: el, style: STYLE_URL, ...CAPE_TOWN, attributionControl: { compact: true },
  });
  map.addControl(new maplibregl.NavigationControl({ showZoom: false, visualizePitch: false }), 'top-right');
  const geolocate = new maplibregl.GeolocateControl({
    positionOptions: { enableHighAccuracy: true }, trackUserLocation: true, showAccuracyCircle: true,
  });
  map.addControl(geolocate, 'top-right');

  const ready = new Promise((res) => map.on('load', res));
  ready.then(() => {
    map.addSource('places', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
      id: 'places-dot', type: 'circle', source: 'places',
      paint: {
        'circle-color': ['get', 'color'],
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, ['case', ['get', 'top'], 6, 4], 15, ['case', ['get', 'top'], 11, 8]],
        'circle-stroke-color': ['case', ['get', 'fav'], '#ffd43b', '#ffffff'],
        'circle-stroke-width': ['case', ['get', 'fav'], 3, 1.5],
      },
    });
    map.addLayer({
      id: 'places-label', type: 'symbol', source: 'places', minzoom: 14,
      layout: {
        'text-field': ['get', 'name'], 'text-font': ['Noto Sans Bold'], 'text-size': 12,
        'text-offset': [0, 1.1], 'text-anchor': 'top', 'text-max-width': 9, 'text-optional': true,
      },
      paint: { 'text-color': '#212529', 'text-halo-color': '#fff', 'text-halo-width': 1.5 },
    });
    map.addLayer({
      id: 'selected', type: 'circle', source: 'places', filter: ['==', ['get', 'id'], ''],
      paint: { 'circle-radius': 16, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': '#212529', 'circle-stroke-width': 3 },
    }, 'places-dot');
    map.on('click', 'places-dot', (e) => onPlaceClick(e.features[0].properties.id));
    map.on('mouseenter', 'places-dot', () => (map.getCanvas().style.cursor = 'pointer'));
    map.on('mouseleave', 'places-dot', () => (map.getCanvas().style.cursor = ''));
  });

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

  return {
    map,
    ready,
    setPlaces(places, favs) {
      ready.then(() => map.getSource('places').setData({
        type: 'FeatureCollection',
        features: places.map((p) => ({
          type: 'Feature', geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
          properties: { id: p.id, name: p.name, top: !!p.top, fav: favs.has(p.id), color: CATEGORIES[p.category]?.color || '#000' },
        })),
      }));
    },
    select(id) { ready.then(() => map.setFilter('selected', ['==', ['get', 'id'], id || ''])); },
    flyTo(p, offsetY = 0) { map.flyTo({ center: [p.lng, p.lat], zoom: Math.max(map.getZoom(), 15), offset: [0, -offsetY] }); },
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
