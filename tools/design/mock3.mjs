// Design round 3 (built on round 2): liberty map + A's icon pins, frosted search, action row; three bottom-control
// options; night mode. Re-skins the running app for screenshots only.
// Run: PW=/path/to/playwright/index.mjs node tools/design/mock2.mjs  (app on http://localhost:8765)
const { webkit, devices } = await import(process.env.PW || 'playwright');
import { readFileSync, mkdirSync } from 'node:fs';

const OUT = process.env.OUT || decodeURIComponent(new URL('./shots3/', import.meta.url).pathname);
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


I.locate = svg('<polygon points="3 11 22 2 13 21 11 13 3 11"/>', 20);
const COMPASS = `<svg viewBox="0 0 24 24" width="22" height="22"><g class="needle"><polygon points="12 3 15 12 9 12" fill="#e03131"/><polygon points="12 21 15 12 9 12" fill="currentColor" opacity=".45"/></g></svg>`;
const BAR = `
  .maplibregl-ctrl-top-right { display: none; }
  #mock-bar { position: fixed; left: 50%; transform: translateX(-50%); bottom: calc(env(safe-area-inset-bottom) + 26px); z-index: 4;
              display: flex; align-items: center; gap: 2px; padding: 6px; border-radius: 999px; }
  #mock-bar button { height: 46px; padding: 0 14px; border-radius: 999px; }
  #mock-bar .sep { width: 1px; height: 24px; background: currentColor; opacity: .15; margin: 0 2px; }
  #mock-bar .acc { width: 46px; padding: 0; justify-content: center; margin-left: 4px; }
  #mock-bar .ico { padding: 0 11px; }
  .loc-on { color: #0b6bcb !important; }
  .roundbtn { width: 44px; height: 44px; border-radius: 50%; display: grid; place-items: center; }
  :root { --glass-strong: rgba(255,255,255,.88); }
  .roundbtn { --glass: var(--glass-strong); }
  .needle { transform-origin: 12px 12px; transform: rotate(var(--bearing, 0deg)); }`;
const BAR_HTML = (withLocate) => `<div id="mock-bar" class="g">${withLocate ? `<button class="ico loc-on" aria-label="My location">${I.locate}</button><span class="sep"></span>` : ''}
  <button>${I.filter}Filter <span class="cnt">1,757</span></button><span class="sep"></span>
  <button class="ico" aria-label="Saved">${I.star}</button><button class="ico" aria-label="Routes">${I.route}</button><button class="acc" aria-label="Add">${I.plus}</button></div>`;

const OPTIONS = {
  // 1: slim vertical glass pill on the right, just above the bar
  stack: { css: `#top { right: 8px !important; } #mock-side { --glass: var(--glass-strong); position: fixed; right: 14px; bottom: calc(env(safe-area-inset-bottom) + 96px); z-index: 4; border-radius: 22px; display: grid; padding: 4px; }
                 #mock-side button { width: 44px; height: 44px; justify-content: center; border-radius: 18px; }
                 #mock-side .sep { height: 1px; background: currentColor; opacity: .12; margin: 0 8px; }`,
           html: `${BAR_HTML(false)}<div id="mock-side" class="g"><button aria-label="Face north">${COMPASS}</button><span class="sep"></span><button class="loc-on" aria-label="My location">${I.locate}</button></div>` },
  // 2: locate in the bar; compass small, top right, only when rotated
  inbar: { css: `#mock-compass { position: fixed; right: 12px; top: calc(env(safe-area-inset-top) + 76px); z-index: 4; }
                 #top { right: 8px !important; }`,
           html: `${BAR_HTML(true)}<button id="mock-compass" class="g roundbtn" aria-label="Face north">${COMPASS}</button>` },
  // 3: locate inside the search bar; compass just below it when rotated
  insearch: { css: `#top { right: 8px !important; }
                    .searchbar { align-items: center; } .mock-sloc { border: 0; background: none; color: #0b6bcb; padding: 0 6px; display: grid; place-items: center; }
                    #mock-compass { position: fixed; right: 12px; top: calc(env(safe-area-inset-top) + 64px); z-index: 4; }`,
              html: `${BAR_HTML(false)}<button id="mock-compass" class="g roundbtn" aria-label="Face north">${COMPASS}</button>`,
              after: `(() => { const sb = document.querySelector('.searchbar'); const b = document.createElement('button'); b.className = 'mock-sloc'; b.setAttribute('aria-label', 'My location');
                        b.innerHTML = '${I.locate.replace(/'/g, "\\'")}'; sb.insertBefore(b, sb.querySelector('#btn-menu')); })()` },
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


const SHOTS = [{ id: 'r3-1-stack', opt: 'stack' }, { id: 'r3-2-inbar', opt: 'inbar' }, { id: 'r3-3-insearch', opt: 'insearch' },
               { id: 'r3-1-stack-night', opt: 'stack', night: true }];
const b = await webkit.launch();
for (const s of SHOTS.filter((s) => !process.env.ONLY || s.id.startsWith(process.env.ONLY))) {
  const ctx = await b.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 2, colorScheme: s.night ? 'dark' : 'light', serviceWorkers: 'block',
                                   geolocation: { latitude: -33.9268, longitude: 18.4172, accuracy: 25 }, permissions: ['geolocation'] });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(s.id, 'pageerror:', e.message));
  if (s.night) await page.route('https://tiles.openfreemap.org/styles/liberty', (r) => r.fulfill({ body: DARK_STYLE, contentType: 'application/json' }));
  await page.addInitScript(([p]) => { localStorage.setItem('lp.passphrase', p);
    localStorage.setItem('lp.view', JSON.stringify({ center: [18.4172, -33.9245], zoom: 14.6 })); }, [PASS]);
  await page.goto('http://localhost:8765/index.html');
  await page.waitForFunction(() => window.__lp?.mapView?.map?.loaded(), null, { timeout: 20000 }).catch(() => {});
  const NIGHT = s.night ? `:root { --glass-strong: rgba(24,29,36,.9); }
    .maplibregl-ctrl-attrib { background: rgba(21,26,33,.75) !important; color: #8d99a6; } .maplibregl-ctrl-attrib a { color: #8d99a6 !important; }` : '';
  await page.addStyleTag({ content: BASE(s.night) + BAR + OPTIONS[s.opt].css + NIGHT });
  await page.evaluate(iconPins(!!s.night));
  // show the blue location dot, then rotate the map a little so the compass has a reason to appear
  await page.evaluate(() => window.__lp.mapView.locate()); await page.waitForTimeout(2500);
  await page.evaluate(() => { const m = window.__lp.mapView.map; m.jumpTo({ center: [18.4172, -33.9245], zoom: 14.6, bearing: -28 }); });
  await page.evaluate((h) => document.body.insertAdjacentHTML('beforeend', h), OPTIONS[s.opt].html);
  if (OPTIONS[s.opt].after) await page.evaluate(OPTIONS[s.opt].after);
  await page.evaluate(() => document.documentElement.style.setProperty('--bearing', `${window.__lp.mapView.map.getBearing() * -1}deg`));
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${OUT}${s.id}.jpg`, type: 'jpeg', quality: 80 });
  await ctx.close();
  console.log('done', s.id);
}
await b.close();
