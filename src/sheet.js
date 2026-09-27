/* Bottom sheet: shows one place and the guide text of each mention, one slide per
   mention (swipe horizontally between them). */
import { CATEGORIES, annotation, setAnnotation } from './data.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function createSheet(el, { guide, onRef, onEditUser, onClose, onChange }) {
  const $ = (sel) => el.querySelector(sel);
  let current = null;

  el.addEventListener('click', (e) => {
    const ref = e.target.closest('a[data-ref]');
    if (ref) { e.preventDefault(); onRef(ref.dataset.ref); return; }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act || !current) return;
    if (act === 'close') close();
    if (act === 'expand') el.classList.toggle('full');
    if (act === 'fav') { setAnnotation(current.id, { fav: !annotation(current.id).fav }); renderHead(); onChange(); }
    if (act === 'edit') onEditUser(current);
    if (act === 'prev' || act === 'next') {
      const track = $('.slides');
      track.scrollBy({ left: (act === 'next' ? 1 : -1) * track.clientWidth, behavior: 'smooth' });
    }
  });
  el.addEventListener('change', (e) => {
    if (e.target.matches('textarea.note') && current) setAnnotation(current.id, { note: e.target.value });
  });
  $('.handle').addEventListener('click', () => el.classList.toggle('full'));

  function renderHead() {
    const p = current, cat = CATEGORIES[p.category] || {};
    const fav = annotation(p.id).fav;
    const gmaps = `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`;
    $('.head').innerHTML = `
      <div class="title-row">
        <span class="badge" style="background:${cat.color}">${esc(cat.label)}</span>
        ${p.top ? '<span class="badge top">Top sight</span>' : ''}
        ${p.price ? `<span class="price">${esc(p.price)}</span>` : ''}
        <span class="spacer"></span>
        <button data-act="fav" class="icon ${fav ? 'on' : ''}" aria-label="Favourite">${fav ? '★' : '☆'}</button>
        <button data-act="expand" class="icon" aria-label="Expand">⤢</button>
        <button data-act="close" class="icon" aria-label="Close">✕</button>
      </div>
      <h2>${esc(p.name)}</h2>
      <div class="meta">${[esc([p.subcategory, p.area].filter(Boolean).join(' · ')), `<a href="${gmaps}" target="_blank" rel="noopener">Google Maps ↗</a>`].filter(Boolean).join(' · ')}
        ${p.geo?.confidence === 'low' ? ' · <span class="warn" title="Approximate location">≈ location</span>' : ''}
        ${p.user ? ' · <a href="#" data-act="edit">Edit</a>' : ''}</div>`;
  }

  function slideHtml(m, i, n) {
    const s = guide.sectionById[m.section];
    const crumbs = [s.chapter.startsWith('gen-') ? 'General' : null, s.area, s.parent !== s.title ? s.parent : null, s.title]
      .filter((c, i, a) => c && a.indexOf(c) === i).map(esc).join(' › ');
    return `<article class="slide" data-i="${i}">
      <div class="crumbs">${crumbs}${s.page ? ` · p. ${s.page}` : ''}<span class="count">${i + 1}/${n}</span></div>
      <div class="text">${s.html}</div></article>`;
  }

  function highlight(slide, m, name) {
    const box = slide.querySelector('.text');
    let target = m.anchor && box.querySelector(`[id="${m.anchor}"]`);
    // mark exact-name text occurrences
    const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT);
    const hits = [];
    for (let n; (n = walker.nextNode());) { const i = n.nodeValue.indexOf(name); if (i >= 0) hits.push([n, i]); }
    for (const [node, i] of hits) {
      const r = document.createRange(); r.setStart(node, i); r.setEnd(node, i + name.length);
      const mark = document.createElement('mark'); r.surroundContents(mark);
      target ||= mark;
    }
    if (target) {
      target.classList.add('hit');
      const block = target.closest('p, li') || target;
      block.classList.add('hit-block');
      requestAnimationFrame(() => { if (block.offsetTop > slide.clientHeight / 2) slide.scrollTop = block.offsetTop - 40; });
    }
  }

  function renderBody() {
    const p = current;
    const a = annotation(p.id);
    const note = `<div class="note-box"><textarea class="note" rows="2" placeholder="My note…">${esc(a.note ?? p.note ?? '')}</textarea></div>`;
    const ms = p.mentions || [];
    if (!ms.length) { $('.body').innerHTML = `<div class="slides"><article class="slide">${note}<p class="muted">${p.user ? 'Your own place.' : 'Only on the neighbourhood map in the guide — no text.'}</p></article></div>`; return; }
    $('.body').innerHTML = `
      <div class="slides">${ms.map((m, i) => slideHtml(m, i, ms.length)).join('')}</div>
      ${ms.length > 1 ? `<div class="pager"><button data-act="prev" class="icon">‹</button><span class="dots">${ms.map((_, i) => `<i data-i="${i}"></i>`).join('')}</span><button data-act="next" class="icon">›</button></div>` : ''}
      ${note}`;
    const slides = [...el.querySelectorAll('.slide')];
    slides.forEach((s, i) => highlight(s, ms[i], p.name));
    const track = $('.slides'), dots = [...el.querySelectorAll('.dots i')];
    const upd = () => { const i = Math.round(track.scrollLeft / track.clientWidth); dots.forEach((d, j) => d.classList.toggle('on', i === j)); };
    track.addEventListener('scroll', upd, { passive: true }); upd();
  }

  function open(place) {
    current = place;
    renderHead(); renderBody();
    el.hidden = false;
    requestAnimationFrame(() => el.classList.add('open'));
  }
  function close() { el.classList.remove('open', 'full'); el.hidden = true; current = null; onClose(); }

  return { open, close, get current() { return current; }, height: () => (el.hidden ? 0 : el.offsetHeight) };
}
