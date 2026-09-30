// Design proposals: the real app, re-skinned per variant (CSS + map style + pin style),
// screenshotted at iPhone size. Nothing here changes the app itself.
// Run: node mock.mjs   (app served on http://localhost:8765)
// needs Playwright: npm i playwright in some folder and set PW to its index.mjs
const { webkit, devices } = await import(process.env.PW || 'playwright');
import { readFileSync, mkdirSync } from 'node:fs';

const OUT = new URL('./shots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const PASS = readFileSync('/Users/philippevonwurstemberger/Documents/Github Projects/LP_South_Africa/data/private/passphrase.txt', 'utf8').trim();
const styleJSON = {};
for (const s of ['liberty', 'bright', 'positron', 'dark']) styleJSON[s] = await (await fetch(`https://tiles.openfreemap.org/styles/${s}`)).text();

const CAT_COLORS = { sight: '#d9480f', activity: '#2f9e44', eat: '#c2255c', drink: '#7048e8', sleep: '#1971c2', shop: '#e67700', area: '#0c8599', info: '#495057', mine: '#f08c00' };
const EMOJI = { sight: '🏛️', activity: '🥾', eat: '🍴', drink: '☕', sleep: '🛏️', shop: '🛍️', area: '🗺️', info: 'ℹ️', mine: '❤️' };

// ---- per-variant map tweaks (run in the page) --------------------------------------
const mapTweaks = {
  // icon pins: white disc + emoji + coloured ring, shown from zoom 12.5; dots below that
  iconPins: `(async () => {
    const m = window.__lp.mapView.map, C = ${JSON.stringify(CAT_COLORS)}, E = ${JSON.stringify(EMOJI)};
    for (const [k, col] of Object.entries(C)) {
      const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
      x.beginPath(); x.arc(32, 32, 28, 0, 7); x.fillStyle = '#fff'; x.fill(); x.lineWidth = 6; x.strokeStyle = col; x.stroke();
      x.font = '28px system-ui'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(E[k], 32, 34);
      m.addImage('pin-' + k, x.getImageData(0, 0, 64, 64), { pixelRatio: 2 });
    }
    const byColor = ['match', ['get', 'color']]; for (const [k, col] of Object.entries(C)) byColor.push(col, 'pin-' + k); byColor.push('pin-info');
    m.addLayer({ id: 'mock-pins', type: 'symbol', source: 'places', minzoom: 12.5, filter: ['==', ['get', 'kind'], 'point'],
      layout: { 'icon-image': byColor, 'icon-size': ['interpolate', ['linear'], ['zoom'], 12.5, 0.8, 16, 1.1], 'icon-allow-overlap': true, 'icon-ignore-placement': true } });
    m.setPaintProperty('places-dot', 'circle-opacity', ['step', ['zoom'], 1, 12.5, 0]);
    m.setPaintProperty('places-dot', 'circle-stroke-opacity', ['step', ['zoom'], 1, 12.5, 0]);
  })()`,
  // sign tiles: rounded squares in category colour with white border
  signPins: `(async () => {
    const m = window.__lp.mapView.map, C = ${JSON.stringify(CAT_COLORS)}, E = ${JSON.stringify(EMOJI)};
    for (const [k, col] of Object.entries(C)) {
      const c = document.createElement('canvas'); c.width = c.height = 60; const x = c.getContext('2d');
      const r = (X, Y, W, H, R) => { x.beginPath(); x.roundRect(X, Y, W, H, R); };
      r(2, 2, 56, 56, 10); x.fillStyle = '#fff'; x.fill(); r(6, 6, 48, 48, 7); x.fillStyle = col; x.fill();
      x.font = '26px system-ui'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(E[k], 30, 32);
      m.addImage('sign-' + k, x.getImageData(0, 0, 60, 60), { pixelRatio: 2 });
    }
    const byColor = ['match', ['get', 'color']]; for (const [k, col] of Object.entries(C)) byColor.push(col, 'sign-' + k); byColor.push('sign-info');
    m.addLayer({ id: 'mock-pins', type: 'symbol', source: 'places', minzoom: 12, filter: ['==', ['get', 'kind'], 'point'],
      layout: { 'icon-image': byColor, 'icon-size': 0.85, 'icon-allow-overlap': true, 'icon-ignore-placement': true } });
    m.setPaintProperty('places-dot', 'circle-opacity', ['step', ['zoom'], 1, 12, 0]);
    m.setPaintProperty('places-dot', 'circle-stroke-opacity', ['step', ['zoom'], 1, 12, 0]);
    
  })()`,
  // glow: soft halo under a bright core with a dark ring
  glowPins: `(() => {
    const m = window.__lp.mapView.map;
    m.addLayer({ id: 'mock-glow', type: 'circle', source: 'places', filter: ['==', ['get', 'kind'], 'point'],
      paint: { 'circle-color': ['get', 'color'], 'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 9, 15, 18], 'circle-blur': 1, 'circle-opacity': 0.55 } }, 'places-dot');
    m.setPaintProperty('places-dot', 'circle-stroke-color', '#0d1117');
    m.setPaintProperty('places-dot', 'circle-stroke-width', 2);
    m.setPaintProperty('places-label', 'text-color', '#e9eef3');
    m.setPaintProperty('places-label', 'text-halo-color', '#0d1117');
    m.setPaintProperty('area-label', 'text-halo-color', '#0d1117');
  })()`,
  // quiet: small dots, no white ring, darker labels
  quietPins: `(() => {
    const m = window.__lp.mapView.map;
    m.setPaintProperty('places-dot', 'circle-radius', ['interpolate', ['linear'], ['zoom'], 10, 3.5, 15, 7]);
    m.setPaintProperty('places-dot', 'circle-stroke-width', 1);
    m.setPaintProperty('places-dot', 'circle-stroke-color', 'rgba(255,255,255,.9)');
    m.setLayoutProperty('places-label', 'text-size', 11);
    m.setPaintProperty('shape-fill', 'fill-opacity', ['case', ['get', 'sel'], 0.14, 0.03]);
  })()`,
};

// ---- extra DOM for some variants -----------------------------------------------------
const addActionRow = `(() => {
  const head = document.querySelector('#sheet .head'); if (!head || head.querySelector('.mock-actions')) return;
  const row = document.createElement('div'); row.className = 'mock-actions';
  row.innerHTML = '<button class="a-primary">↗ Directions</button><button>☆ Save</button><button>✎ Note</button>';
  head.appendChild(row);
})()`;
const addDock = `(() => {
  const d = document.createElement('nav'); d.id = 'mock-dock';
  const ic = (p) => '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + p + '</svg>';
  d.innerHTML = [
    ['Explore', ic('<polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/>'), 'on'],
    ['Saved', ic('<polygon points="12 2 15 9 22 9.3 16.5 14 18.5 21 12 17 5.5 21 7.5 14 2 9.3 9 9"/>')],
    ['Add', ic('<circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>')],
    ['Routes', ic('<circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M8 19h7a3.5 3.5 0 0 0 0-7H9a3.5 3.5 0 0 1 0-7h7"/>')],
    ['Filter', ic('<line x1="4" y1="6" x2="20" y2="6"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="10" y1="18" x2="14" y2="18"/>')],
  ].map(([t, i, on]) => '<button class="' + (on || '') + '">' + i + '<span>' + t + '</span></button>').join('');
  document.body.appendChild(d);
})()`;

// ---- variants ------------------------------------------------------------------------------
const FONT_BARLOW = `@import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=Barlow:wght@400;500;600&display=swap');`;
const variants = [
  { id: 'now', name: 'Current', style: 'liberty', css: '', map: [], dom: [] },
  { id: 'a', name: 'A · Refined', style: 'liberty', map: ['iconPins'], dom: [addActionRow], css: `
    :root { --shadow: 0 6px 22px rgba(24,36,48,.16); --accent: #0b6bcb; }
    .searchbar { background: rgba(255,255,255,.78); backdrop-filter: blur(16px) saturate(1.4); -webkit-backdrop-filter: blur(16px) saturate(1.4); border-radius: 16px; }
    #btn-filter { background: rgba(255,255,255,.85); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); border: 0; color: #13202b; box-shadow: var(--shadow); }
    #shown-count { background: rgba(255,255,255,.7); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); font-weight: 500; }
    .maplibregl-ctrl-group { border-radius: 12px !important; box-shadow: var(--shadow) !important; }
    #sheet { border-radius: 24px 24px 0 0; box-shadow: 0 -8px 30px rgba(24,36,48,.18); }
    .head { border-bottom: 0; padding-bottom: 4px; }
    .head h2 { font-size: 27px; letter-spacing: -.02em; margin-top: 2px; }
    .badge { border-radius: 999px; font-size: 11px; padding: 3px 9px; letter-spacing: .04em; }
    .mock-actions { display: grid; grid-template-columns: 1.3fr 1fr 1fr; gap: 8px; margin: 12px 0 6px; }
    .mock-actions button { border: 0; background: #eef2f6; color: #13202b; font-weight: 600; font-size: 14px; border-radius: 12px; padding: 10px 6px; }
    .mock-actions .a-primary { background: var(--accent); color: #fff; }
    .summary { font-size: 17px; line-height: 1.5; }
    .rec { border-left: 0; background: #f4f6f8; border-radius: 14px; }
    .mention { border: 0; background: #f4f6f8; border-radius: 14px; }
    .mentions-head { font-size: 12px; }
    .note-box textarea { border-radius: 12px; background: #fff; }
    .fab { width: 56px; height: 56px; background: #0b6bcb; }` },
  { id: 'b', name: 'B · Brown sign', style: 'bright', map: ['signPins'], dom: [addActionRow], css: `${FONT_BARLOW}
    :root { --brown: #6b3a1f; --brown-2: #8a5530; --ink: #1f1a16; font-family: 'Barlow', system-ui, sans-serif; }
    .searchbar { border-radius: 8px; border: 2px solid var(--ink); box-shadow: 0 3px 0 rgba(31,26,22,.25); }
    #search { font-family: 'Barlow', system-ui; font-weight: 500; }
    #btn-filter, #shown-count { font-family: 'Barlow Condensed', system-ui; text-transform: uppercase; letter-spacing: .06em; border-radius: 6px; }
    #btn-filter { background: var(--brown); color: #fff; border: 2px solid #fff; outline: 2px solid var(--brown); box-shadow: 0 3px 8px rgba(0,0,0,.25); }
    #shown-count { background: #fff; color: var(--ink); border: 2px solid var(--ink); box-shadow: none; }
    #sheet { border-radius: 10px 10px 0 0; }
    .handle span { background: #cdbfb3; }
    .head { background: var(--brown); color: #fff; margin: 4px 10px 0; border-radius: 8px; border: 3px solid #fff; outline: 3px solid var(--brown); padding: 10px 12px 12px; }
    .head h2 { font-family: 'Barlow Condensed', system-ui; font-size: 32px; font-weight: 700; text-transform: uppercase; letter-spacing: .02em; line-height: 1.05; color: #fff; }
    .head .meta, .head .meta a { color: #f3e6da; }
    .head .icon { color: #fff; }
    .badge { border-radius: 4px; font-family: 'Barlow Condensed'; font-size: 13px; background: #fff !important; color: var(--brown) !important; }
    .mock-actions { display: flex; gap: 8px; margin-top: 10px; }
    .mock-actions button { flex: 1; font-family: 'Barlow Condensed'; text-transform: uppercase; letter-spacing: .05em; font-size: 15px; background: transparent; color: #fff; border: 2px solid #fff; border-radius: 5px; padding: 6px; }
    .mock-actions .a-primary { background: #fff; color: var(--brown); }
    .summary { font-size: 16.5px; }
    .rec { border-left: 4px solid var(--brown-2); background: #f7f2ed; border-radius: 4px; }
    .mentions-head { font-family: 'Barlow Condensed'; font-size: 15px; color: var(--brown); letter-spacing: .08em; }
    .mention { border: 0; border-top: 2px solid #eadfd5; border-radius: 0; margin: 0 14px; padding: 12px 0; }
    .crumbs { font-family: 'Barlow Condensed'; text-transform: uppercase; letter-spacing: .05em; font-size: 13px; }
    .fab { border-radius: 10px; background: var(--brown); border: 3px solid #fff; outline: 2px solid var(--brown); }` },
  { id: 'c', name: 'C · Night drive', style: 'dark', map: ['glowPins'], dom: [addActionRow], css: `
    :root { --bg: #151a21; --fg: #e9eef3; --muted: #8d99a6; --line: #2a323c; --soft: #1e252e; --amber: #ffb224; color-scheme: dark;
            font-family: ui-rounded, 'SF Pro Rounded', system-ui, sans-serif; }
    body { background: #0d1117; }
    .searchbar { background: rgba(21,26,33,.88); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); border: 1px solid #2a323c; border-radius: 18px; }
    #search { color: #e9eef3; font-size: 17px; } #search::placeholder { color: #8d99a6; }
    .searchbar .icon { color: #e9eef3; }
    #btn-filter { background: rgba(21,26,33,.9); color: var(--amber); border: 1.5px solid var(--amber); }
    #shown-count { background: rgba(21,26,33,.9); color: #e9eef3; }
    .maplibregl-ctrl-group { background: #151a21 !important; } .maplibregl-ctrl-group button span { filter: invert(1); }
    #sheet { background: var(--bg); color: var(--fg); border-radius: 26px 26px 0 0; box-shadow: 0 -10px 40px rgba(0,0,0,.6); }
    .head { border-bottom-color: var(--line); }
    .head h2 { font-size: 28px; letter-spacing: -.01em; }
    .icon.on, .head .icon { color: var(--amber); }
    .mock-actions { display: grid; grid-template-columns: 1.4fr 1fr 1fr; gap: 10px; margin: 12px 0 6px; }
    .mock-actions button { background: #222a34; color: #e9eef3; border: 0; border-radius: 16px; padding: 14px 6px; font-size: 16px; font-weight: 600; }
    .mock-actions .a-primary { background: var(--amber); color: #1a1406; }
    .summary { font-size: 17.5px; color: #d5dde5; }
    .rec { background: #1e252e; border-left-color: var(--amber); }
    .mention { background: #1b2129; border-color: #2a323c; border-radius: 18px; }
    .text mark { background: rgba(255,178,36,.28); color: #fff; }
    .note-box textarea { background: #1b2129; color: #e9eef3; border-color: #2a323c; border-radius: 14px; }
    .meta a, .text a, button.link { color: #7cc4ff; }
    .fab { background: var(--amber); color: #1a1406; width: 60px; height: 60px; }` },
  { id: 'd', name: 'D · Map first', style: 'positron', map: ['quietPins'], dom: [addDock, addActionRow], css: `
    :root { --accent: #0a7cff; }
    #filterbar, .fab { display: none !important; }
    .searchbar { border-radius: 999px; box-shadow: 0 2px 12px rgba(0,0,0,.12); }
    #search { padding: 12px 18px; }
    #mock-dock { position: fixed; left: 0; right: 0; bottom: 0; z-index: 4; display: grid; grid-template-columns: repeat(5, 1fr);
      padding: 6px 6px calc(env(safe-area-inset-bottom) + 10px); background: rgba(250,250,252,.92); backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px); border-top: 1px solid #e3e5e8; }
    #mock-dock button { border: 0; background: none; display: flex; flex-direction: column; align-items: center; gap: 2px; font-size: 11px; color: #6b7280; padding: 4px 0; }
    #mock-dock button.on { color: var(--accent); }
    .maplibregl-ctrl-bottom-right, .maplibregl-ctrl-bottom-left { bottom: 70px; }
    #sheet { bottom: 64px; border-radius: 14px 14px 0 0; box-shadow: 0 -2px 16px rgba(0,0,0,.12); }
    .head { border-bottom: 0; }
    .head .title-row .badge { display: none; }
    .head h2 { font-size: 28px; font-weight: 800; letter-spacing: -.02em; }
    .mock-actions { display: flex; gap: 8px; margin: 10px 0 4px; }
    .mock-actions button { flex: 1; border: 0; border-radius: 10px; padding: 9px 4px; background: #eef0f3; color: var(--accent); font-weight: 600; }
    .mock-actions .a-primary { background: var(--accent); color: #fff; }
    .rec { border-left: 0; background: #f2f4f7; border-radius: 12px; }
    .mention { border: 0; border-radius: 0; border-bottom: 1px solid #eceef1; margin: 0 16px; padding: 12px 0; }
    .mentions-head { color: #111; font-size: 18px; text-transform: none; letter-spacing: 0; font-weight: 700; }` },
];

// ---- run ----------------------------------------------------------------------------------
const b = await webkit.launch();
for (const v of variants.filter((v) => !process.env.ONLY || v.id === process.env.ONLY)) {
  const ctx = await b.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 2, colorScheme: 'light', serviceWorkers: 'block' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(v.id, 'pageerror:', e.message));
  await page.route('https://tiles.openfreemap.org/styles/liberty', (r) => r.fulfill({ body: styleJSON[v.style], contentType: 'application/json' }));
  await page.addInitScript(([p]) => {
    localStorage.setItem('lp.passphrase', p);
    localStorage.setItem('lp.view', JSON.stringify({ center: [18.4172, -33.9228], zoom: 14.3 }));
  }, [PASS]);
  await page.goto('http://localhost:8765/index.html');
  await page.waitForFunction(() => window.__lp?.mapView?.map?.loaded(), null, { timeout: 20000 }).catch(() => {});
  if (v.css) await page.addStyleTag({ content: v.css });
  for (const t of v.map) await page.evaluate(mapTweaks[t]);
  for (const d of v.dom) if (d === addDock) await page.evaluate(d);
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `${OUT}${v.id}-map.jpg`, type: 'jpeg', quality: 80 });
  // place panel: Constantia (friend tip + summary + mentions + outline)
  await page.fill('#search', 'Constantia'); await page.waitForTimeout(300);
  await page.click('#results li[data-id]'); await page.waitForTimeout(600);
  for (const d of v.dom) if (d !== addDock) await page.evaluate(d);
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${OUT}${v.id}-place.jpg`, type: 'jpeg', quality: 80 });
  await ctx.close();
  console.log('done', v.id);
}
await b.close();
