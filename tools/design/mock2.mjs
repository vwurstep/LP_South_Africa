// Design round 2: liberty map + A's icon pins, frosted search, action row; three bottom-control
// options; night mode. Re-skins the running app for screenshots only.
// Run: PW=/path/to/playwright/index.mjs node tools/design/mock2.mjs  (app on http://localhost:8765)
const { webkit, devices } = await import(process.env.PW || 'playwright');
import { readFileSync, mkdirSync } from 'node:fs';

const OUT = process.env.OUT || decodeURIComponent(new URL('./shots2/', import.meta.url).pathname);
mkdirSync(OUT, { recursive: true });
const ROOT = decodeURIComponent(new URL('../../', import.meta.url).pathname);
const PASS = readFileSync(ROOT + 'data/private/passphrase.txt', 'utf8').trim();
const DARK_STYLE = await (await fetch('https://tiles.openfreemap.org/styles/dark')).text();

const CAT = { sight: '#d9480f', activity: '#2f9e44', eat: '#c2255c', drink: '#7048e8', sleep: '#1971c2', shop: '#e67700', area: '#0c8599', info: '#495057', mine: '#f08c00' };
const EMO = { sight: '🏛️', activity: '🥾', eat: '🍴', drink: '☕', sleep: '🛏️', shop: '🛍️', area: '🗺️', info: 'ℹ️', mine: '❤️' };

// icon pins (A): disc + emoji + coloured ring from zoom 12.5, plain dots below; night = dark disc
const iconPins = (night) => `(() => {
  const m = window.__lp.mapView.map, C = ${JSON.stringify(CAT)}, E = ${JSON.stringify(EMO)};
  for (const [k, col] of Object.entries(C)) {
    const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
    x.beginPath(); x.arc(32, 32, 28, 0, 7); x.fillStyle = ${night ? "'#1d242c'" : "'#fff'"}; x.fill();
    x.lineWidth = 6; x.strokeStyle = col; x.stroke();
    x.font = '28px system-ui'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(E[k], 32, 34);
    m.addImage('pin-' + k, x.getImageData(0, 0, 64, 64), { pixelRatio: 2 });
  }
  const img = ['match', ['get', 'color']]; for (const [k, col] of Object.entries(C)) img.push(col, 'pin-' + k); img.push('pin-info');
  m.addLayer({ id: 'mock-pins', type: 'symbol', source: 'places', minzoom: 12.5, filter: ['==', ['get', 'kind'], 'point'],
    layout: { 'icon-image': img, 'icon-size': ['interpolate', ['linear'], ['zoom'], 12.5, 0.8, 16, 1.1],
              'icon-allow-overlap': true, 'icon-ignore-placement': true } }, 'places-label');
  m.setPaintProperty('places-dot', 'circle-opacity', ['step', ['zoom'], 1, 12.5, 0]);
  m.setPaintProperty('places-dot', 'circle-stroke-opacity', ['step', ['zoom'], 1, 12.5, 0]);
  m.setLayoutProperty('places-label', 'text-offset', [0, 1.5]);
  ${night ? `m.setPaintProperty('places-label', 'text-color', '#e9eef3'); m.setPaintProperty('places-label', 'text-halo-color', '#0d1117');
  m.setPaintProperty('area-label', 'text-halo-color', '#0d1117');` : ''}
})()`;

const svg = (p, s = 22) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
const I = {
  filter: svg('<line x1="4" y1="6" x2="20" y2="6"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="10" y1="18" x2="14" y2="18"/>'),
  star: svg('<polygon points="12 2.5 14.9 8.6 21.5 9.3 16.6 13.8 18 20.3 12 17 6 20.3 7.4 13.8 2.5 9.3 9.1 8.6"/>'),
  route: svg('<circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M8 19h7a3.5 3.5 0 0 0 0-7H9a3.5 3.5 0 0 1 0-7h7"/>'),
  plus: svg('<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>', 24),
  search: svg('<circle cx="11" cy="11" r="7"/><line x1="20" y1="20" x2="16" y2="16"/>', 20),
  menu: svg('<line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/>', 20),
  moon: svg('<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>', 20),
};

// ---- shared look (A): frosted search, panel with action row ---------------------------------
const BASE = (night) => `
  :root { --glass: ${night ? 'rgba(24,29,36,.72)' : 'rgba(255,255,255,.72)'}; --glass-line: ${night ? 'rgba(255,255,255,.08)' : 'rgba(255,255,255,.7)'};
          --shadow: 0 8px 28px rgba(15,25,35,${night ? '.5' : '.16'}); --accent: ${night ? '#ffb224' : '#0b6bcb'}; --on-accent: ${night ? '#1a1406' : '#fff'};
          ${night ? '--bg:#151a21; --fg:#e9eef3; --muted:#8d99a6; --line:#2a323c; --soft:#1e252e; color-scheme: dark;' : ''} }
  #filterbar, .fab { display: none !important; }
  .searchbar { background: var(--glass); backdrop-filter: blur(18px) saturate(1.5); -webkit-backdrop-filter: blur(18px) saturate(1.5);
               border: 1px solid var(--glass-line); border-radius: 18px; box-shadow: var(--shadow); }
  ${night ? '#search { color: #e9eef3; } #search::placeholder { color: #8d99a6; } .searchbar .icon { color: #e9eef3; }' : ''}
  .maplibregl-ctrl-group { background: var(--glass) !important; backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
                           border-radius: 14px !important; box-shadow: var(--shadow) !important; }
  ${night ? '.maplibregl-ctrl-group button span { filter: invert(1); }' : ''}
  #sheet { border-radius: 26px 26px 0 0; box-shadow: 0 -10px 34px rgba(15,25,35,${night ? '.6' : '.18'}); ${night ? 'background: var(--bg); color: var(--fg);' : ''} }
  .head { border-bottom: 0; padding-bottom: 4px; }
  .head [data-act=fav] { display: none; }
  .head h2 { font-size: 27px; letter-spacing: -.02em; margin-top: 2px; }
  .badge { border-radius: 999px; font-size: 11px; padding: 3px 9px; letter-spacing: .04em; }
  .mock-actions { display: grid; grid-template-columns: 1.3fr 1fr 1fr; gap: 8px; margin: 12px 0 6px; }
  .mock-actions button { border: 0; background: ${night ? '#232b35' : '#eef2f6'}; color: ${night ? '#e9eef3' : '#13202b'};
                         font-weight: 600; font-size: 14px; border-radius: 14px; padding: 11px 6px; }
  .mock-actions .a-primary { background: var(--accent); color: var(--on-accent); }
  .summary { font-size: 17px; line-height: 1.5; ${night ? 'color: #d5dde5;' : ''} }
  .rec { border-left: 0; background: ${night ? '#1e252e' : '#f4f6f8'}; border-radius: 16px; }
  .mention { border: 0; background: ${night ? '#1b2129' : '#f4f6f8'}; border-radius: 16px; }
  .text mark { ${night ? 'background: rgba(255,178,36,.28); color: #fff;' : ''} }
  .note-box textarea { border-radius: 14px; ${night ? 'background:#1b2129; color:#e9eef3; border-color:#2a323c;' : ''} }
  ${night ? '.meta a, .text a, button.link { color: #7cc4ff; } .head .icon { color: #e9eef3; }' : ''}
  /* glass controls used by the bottom options */
  .g { background: var(--glass); backdrop-filter: blur(20px) saturate(1.6); -webkit-backdrop-filter: blur(20px) saturate(1.6);
       border: 1px solid var(--glass-line); box-shadow: var(--shadow); color: ${night ? '#e9eef3' : '#13202b'}; }
  .g button { border: 0; background: none; color: inherit; font: 600 15px system-ui; display: inline-flex; align-items: center; gap: 7px; }
  .g .acc, .g.acc { background: var(--accent); color: var(--on-accent); }
  .maplibregl-ctrl-attrib-inner { display: none; }  /* compact (i) credit so bottom controls have room */
  body.mock-open #mock-ctl, body.mock-open #mock-cnt { display: none; }  /* panel replaces the controls */
  ${night ? '.badge.friend { background: #e9eef3 !important; color: #151a21 !important; }' : ''}
  .cnt { font-weight: 500; opacity: .65; font-size: 13px; }
  .maplibregl-ctrl-bottom-right, .maplibregl-ctrl-bottom-left { bottom: 0; }
`;

const OPTIONS = {
  // 1: one floating glass capsule
  bar: {
    css: `#mock-ctl { position: fixed; left: 50%; transform: translateX(-50%); bottom: calc(env(safe-area-inset-bottom) + 26px); z-index: 4;
            display: flex; align-items: center; gap: 2px; padding: 6px; border-radius: 999px; }
          #mock-ctl button { height: 46px; padding: 0 14px; border-radius: 999px; }
          #mock-ctl .sep { width: 1px; height: 24px; background: currentColor; opacity: .15; margin: 0 2px; }
          #mock-ctl .acc { width: 46px; padding: 0; justify-content: center; margin-left: 4px; }
          .maplibregl-ctrl-attrib { opacity: .7; }`,
    html: `<div id="mock-ctl" class="g"><button>${I.filter}Filter <span class="cnt">1,757</span></button><span class="sep"></span>
           <button aria-label="Saved">${I.star}</button><button aria-label="Routes">${I.route}</button><button class="acc" aria-label="Add">${I.plus}</button></div>`,
  },
  // 2: search + quick actions in a bottom card
  bottom: {
    css: `#top .searchbar { display: none; }
          #mock-ctl { position: fixed; left: 10px; right: 10px; bottom: calc(env(safe-area-inset-bottom) + 12px); z-index: 4; border-radius: 24px; padding: 10px; display: grid; gap: 10px; }
          #mock-ctl { --glass: rgba(255,255,255,.86); }
          #mock-ctl .s { display: flex; align-items: center; gap: 8px; min-width: 0; background: rgba(120,130,140,.14); border-radius: 14px; padding: 11px 12px; font: 16px system-ui; }
          #mock-ctl .s span { flex: 1; opacity: .6; }
          #mock-ctl .row { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)) 40px; gap: 8px; }
          #mock-ctl .row button { justify-content: center; min-width: 0; height: 40px; border-radius: 12px; background: rgba(120,130,140,.12); font-size: 14px; gap: 5px; white-space: nowrap; }
          #mock-ctl .row .cnt { display: none; }
          #mock-ctl .row .acc { background: var(--accent); color: var(--on-accent); }
          #mock-ctl .row .acc { width: 40px; padding: 0; }
          .maplibregl-ctrl-bottom-right { bottom: 132px; } .maplibregl-ctrl-bottom-left { bottom: 132px; }`,
    html: `<div id="mock-ctl" class="g"><div class="s">${I.search}<span>Search places…</span>${I.menu}</div>
           <div class="row"><button>${I.filter}Filter <span class="cnt">1,757</span></button><button>${I.star}Saved</button><button>${I.route}Routes</button><button class="acc" aria-label="Add">${I.plus}</button></div></div>`,
  },
  // 3: round glass buttons stacked in the thumb corner + count bottom-left
  corner: {
    css: `#mock-ctl { position: fixed; right: 14px; bottom: calc(env(safe-area-inset-bottom) + 40px); z-index: 4; display: grid; gap: 10px; }
          #mock-ctl button { width: 52px; height: 52px; border-radius: 50%; justify-content: center; position: relative; }
          #mock-ctl .acc { width: 58px; height: 58px; }
          #mock-ctl .badge2 { position: absolute; top: -4px; right: -6px; background: var(--accent); color: var(--on-accent); font: 700 10px system-ui; border-radius: 999px; padding: 2px 5px; }
          #mock-cnt { position: fixed; left: 14px; bottom: calc(env(safe-area-inset-bottom) + 44px); z-index: 4; border-radius: 999px; padding: 8px 12px; font: 600 13px system-ui; }`,
    html: `<div id="mock-ctl"><button class="g" aria-label="Saved">${I.star}</button><button class="g" aria-label="Routes">${I.route}</button>
           <button class="g" aria-label="Filter">${I.filter}<span class="badge2">2</span></button><button class="g acc" aria-label="Add">${I.plus}</button></div>
           <div id="mock-cnt" class="g">1,204 of 1,757 shown</div>`,
  },
};

const addActions = `(() => { const h = document.querySelector('#sheet .head'); if (!h || h.querySelector('.mock-actions')) return;
  const r = document.createElement('div'); r.className = 'mock-actions';
  r.innerHTML = '<button class="a-primary">↗ Directions</button><button>☆ Save</button><button>✎ Note</button>'; h.appendChild(r); })()`;
const appearance = (night) => `(() => { const m = document.querySelector('#menu'); m.showModal();
  const box = document.createElement('div'); box.className = 'mock-appear';
  box.innerHTML = '<h4>Appearance</h4><div class="seg"><button class="${night ? '' : 'on'}">Auto</button><button>Day</button><button class="${night ? 'on' : ''}">Night</button></div>'
    + '<p class="muted small">Auto switches to night at sunset (about 18:40 in Cape Town now) and back at sunrise.</p>';
  m.insertBefore(box, m.children[1]); })()`;
const APPEAR_CSS = (night) => `#menu { border-radius: 22px; ${night ? 'background:#151a21; color:#e9eef3;' : ''} }
  .mock-appear h4 { margin: 4px 0 8px; } .mock-appear .seg { display: grid; grid-template-columns: repeat(3, 1fr); background: ${night ? '#232b35' : '#eef1f4'}; border-radius: 12px; padding: 3px; gap: 3px; }
  .mock-appear .seg button { margin: 0 !important; border: 0; background: none; border-radius: 10px; padding: 8px; font-weight: 600; text-align: center !important; color: inherit; }
  .mock-appear .seg .on { background: ${night ? '#3a4452' : '#fff'}; box-shadow: 0 1px 4px rgba(0,0,0,.12); }
  .mock-appear p { margin: 8px 0 12px; }
  ${night ? '#menu button:not(.primary) { background:#1e252e; color:#e9eef3; border-color:#2a323c; }' : ''}`;

const SHOTS = [
  { id: '1-bar-map', opt: 'bar' },
  { id: '2-bottom-map', opt: 'bottom' },
  { id: '3-corner-map', opt: 'corner' },
  { id: '4-place-day', opt: 'bar', place: true },
  { id: '5-night-map', opt: 'bar', night: true },
  { id: '6-place-night', opt: 'bar', night: true, place: true },
  { id: '7-appearance', opt: 'bar', menu: true },
];

const b = await webkit.launch();
for (const s of SHOTS.filter((s) => !process.env.ONLY || s.id.startsWith(process.env.ONLY))) {
  const ctx = await b.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 2, colorScheme: s.night ? 'dark' : 'light', serviceWorkers: 'block' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(s.id, 'pageerror:', e.message));
  if (s.night) await page.route('https://tiles.openfreemap.org/styles/liberty', (r) => r.fulfill({ body: DARK_STYLE, contentType: 'application/json' }));
  await page.addInitScript(([p]) => { localStorage.setItem('lp.passphrase', p);
    localStorage.setItem('lp.view', JSON.stringify({ center: [18.4172, -33.9228], zoom: 14.3 })); }, [PASS]);
  await page.goto('http://localhost:8765/index.html');
  await page.waitForFunction(() => window.__lp?.mapView?.map?.loaded(), null, { timeout: 20000 }).catch(() => {});
  await page.addStyleTag({ content: BASE(s.night) + OPTIONS[s.opt].css + APPEAR_CSS(s.night) });
  await page.evaluate(iconPins(!!s.night));
  await page.evaluate((h) => document.body.insertAdjacentHTML('beforeend', h), OPTIONS[s.opt].html);
  if (s.place) {
    await page.fill('#search', 'Constantia'); await page.waitForTimeout(300);
    await page.click('#results li[data-id]'); await page.waitForTimeout(600); await page.evaluate(addActions);
    await page.evaluate(() => document.body.classList.add('mock-open'));
  }
  if (s.menu) await page.evaluate(appearance(false));
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `${OUT}${s.id}.jpg`, type: 'jpeg', quality: 80 });
  await ctx.close();
  console.log('done', s.id);
}
await b.close();
