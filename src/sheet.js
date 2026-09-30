/* Bottom sheet: one place. Summary on top, then every mention in the guide as a card
   (the paragraph that mentions it; the full section can be expanded). */
import { CATEGORIES, SIGHT_TAGS, annotation, setAnnotation, googleMapsUrl } from './data.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function createSheet(el, { guide, onRef, onOpenPlace, onEditUser, onClose, onChange }) {
  const $ = (sel) => el.querySelector(sel);
  let current = null, others = [];

  el.addEventListener('click', (e) => {
    const ref = e.target.closest('a[data-ref]');
    if (ref) { e.preventDefault(); onRef(ref.dataset.ref); return; }
    const other = e.target.closest('[data-place]');
    if (other) { onOpenPlace(other.dataset.place); return; }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act || !current) return;
    if (act === 'close') close();
    if (act === 'expand') el.classList.toggle('full');
    if (act === 'fav') { setAnnotation(current.id, { fav: !annotation(current.id).fav }); renderHead(); onChange(); }
    if (act === 'note') {
      const t = $('textarea.note'); if (!t) return;
      t.scrollIntoView({ block: 'center', behavior: 'smooth' }); t.focus({ preventScroll: true });
    }
    if (act === 'edit') onEditUser(current);
    if (act === 'more') {
      const card = e.target.closest('.mention'), m = current.mentions[+card.dataset.i];
      const full = card.querySelector('.full-text');
      if (!full.innerHTML) { full.innerHTML = guide.sectionById[m.section].html; mark(full, current.name, m.anchor); }
      card.classList.toggle('expanded');
      const open = card.classList.contains('expanded');
      e.target.textContent = open ? 'Hide full section ▴' : 'Read full section ▾';
      (open ? full.querySelector('.hit, mark') : card)?.scrollIntoView({ block: open ? 'center' : 'start' });
    }
  });
  el.addEventListener('change', (e) => {
    if (e.target.matches('textarea.note') && current) setAnnotation(current.id, { note: e.target.value });
  });
  $('.handle').addEventListener('click', () => el.classList.toggle('full'));

  // swipe the handle/header down: full → half, half → closed; swipe up: half → full.
  // Works even if the ✕ is ever out of reach.
  let y0 = null;
  const grab = (e) => { if (e.target.closest('button, a, textarea')) return; y0 = e.touches[0].clientY; el.classList.add('dragging'); };
  const move = (e) => {
    if (y0 === null) return;
    const dy = e.touches[0].clientY - y0;
    if (dy > 0) el.style.transform = `translateY(${dy}px)`;
  };
  const drop = (e) => {
    if (y0 === null) return;
    const dy = (e.changedTouches[0]?.clientY ?? y0) - y0;
    y0 = null; el.classList.remove('dragging'); el.style.transform = '';
    if (dy > 80) el.classList.contains('full') ? el.classList.remove('full') : close();
    else if (dy < -60) el.classList.add('full');
  };
  for (const part of [$('.handle'), $('.head')]) {
    part.addEventListener('touchstart', grab, { passive: true });
    part.addEventListener('touchmove', move, { passive: true });
    part.addEventListener('touchend', drop);
    part.addEventListener('touchcancel', drop);
  }
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && current) close(); });
  // iOS can leave the page scrolled up after the keyboard closes, hiding the header
  el.addEventListener('focusout', (e) => { if (e.target.matches('textarea, input')) setTimeout(() => window.scrollTo(0, 0), 50); });

  function renderHead() {
    const p = current, cat = CATEGORIES[p.category] || {};
    const fav = annotation(p.id).fav;
    const gmaps = googleMapsUrl(p);
    const g = p.google;
    const rating = g?.rating ? `<span class="rating" title="Google rating">★ ${g.rating.toFixed(1)}<small> (${(g.count || 0).toLocaleString()})</small></span>` : '';
    $('.head').innerHTML = `
      <div class="title-row">
        <span class="badge" style="background:${cat.color}">${esc(cat.label)}</span>
        ${p.top ? '<span class="badge top">Top sight</span>' : ''}
        ${p.price ? `<span class="price">${esc(p.price)}</span>` : ''}
        ${p.recs?.some((r) => r.type !== 'web') ? '<span class="badge friend">Friend tip</span>' : ''}
        ${p.recs?.some((r) => r.type === 'web') ? '<span class="badge web">Road trip</span>' : ''}
        ${rating}
        <span class="spacer"></span>
        <button data-act="expand" class="icon" aria-label="Expand">⤢</button>
        <button data-act="close" class="icon" aria-label="Close">✕</button>
      </div>
      <h2>${esc(p.name)}</h2>
      ${p.tags?.length ? `<div class="tags">${p.tags.filter((t) => SIGHT_TAGS[t]).map((t) => `<span>${SIGHT_TAGS[t].emoji} ${esc(SIGHT_TAGS[t].label)}</span>`).join('')}</div>` : ''}
      <div class="meta">${[esc([p.subcategory, [p.locality, p.area].find((x) => x && x !== p.name)].filter(Boolean).join(' · ')), `<a href="${gmaps}" target="_blank" rel="noopener">Google Maps ↗</a>`].filter(Boolean).join(' · ')}
        ${p.geo?.confidence === 'low' && (p.kind || 'point') === 'point' ? ' · <span class="warn" title="Approximate location">≈ location</span>' : ''}
        ${p.user ? ' · <a href="#" data-act="edit">Edit</a>' : ''}</div>
      <div class="actions">
        <a class="primary" href="${directionsUrl(p)}" target="_blank" rel="noopener">↗ Directions</a>
        <button data-act="fav" class="${fav ? 'on' : ''}" aria-pressed="${!!fav}">${fav ? '★ Saved' : '☆ Save'}</button>
        <button data-act="note">✎ Note</button>
      </div>`;
  }

  // Google Maps navigation; places whose position is only a guess go by name instead
  function directionsUrl(p) {
    const dest = !p.user && p.geo?.confidence === 'low' && (p.kind || 'point') === 'point'
      ? [p.name, p.locality, p.country].filter(Boolean).join(', ') : `${p.lat},${p.lng}`;
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`;
  }

  function crumbs(s) {
    const chapter = s.chapter.startsWith('gen-') ? 'General' : guide.chapterById?.[s.chapter]?.title;
    return [chapter, s.area, s.parent !== s.title ? s.parent : null, s.title]
      .filter((c, i, a) => c && a.indexOf(c) === i).map(esc).join(' › ');
  }

  // highlight the place name (and its marked anchor) inside rendered guide text
  function mark(box, name, anchor) {
    const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT);
    const hits = [];
    for (let n; (n = walker.nextNode());) { const i = n.nodeValue.indexOf(name); if (i >= 0) hits.push([n, i]); }
    for (const [node, i] of hits) {
      const r = document.createRange(); r.setStart(node, i); r.setEnd(node, i + name.length);
      r.surroundContents(document.createElement('mark'));
    }
    if (anchor) box.querySelector(`[id="${anchor}"]`)?.classList.add('hit');
  }

  function mentionHtml(m, i) {
    const s = guide.sectionById[m.section];
    return `<article class="mention" data-i="${i}">
      <div class="crumbs">${crumbs(s)}${s.page ? ` · p. ${s.page}` : ''}</div>
      <div class="text excerpt">${m.excerpt || ''}</div>
      <div class="text full-text"></div>
      <button class="link" data-act="more">Read full section ▾</button></article>`;
  }

  function renderBody() {
    const p = current;
    const a = annotation(p.id);
    const ms = p.mentions || [];
    const summary = p.summary || (p.user ? '' : ms.length ? '' : 'Only shown on the neighbourhood map in the guide, without a description.');
    const recs = (p.recs || []).map((r) => r.type === 'web'
      ? `<blockquote class="rec web"><p>${esc(r.comment)}</p>
          <footer>Sources: ${(r.sources || []).map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a>`).join(' · ') || esc(r.by)}</footer></blockquote>`
      : `<blockquote class="rec"><p>“${esc(r.comment)}”</p>
          <footer>— ${esc(r.by)}${r.date ? `, ${esc(r.date)}` : ''}</footer></blockquote>`).join('');
    const also = others.map((id) => guide.placeById[id]).filter(Boolean);
    $('.body').innerHTML = `
      ${recs}
      ${summary ? `<p class="summary">${esc(summary)}</p>` : ''}
      ${also.length ? `<p class="also">Also here: ${also.map((q) => `<a data-place="${q.id}">${esc(q.name)}</a>`).join(', ')}</p>` : ''}
      <div class="note-box"><textarea class="note" rows="2" placeholder="My note…">${esc(a.note ?? p.note ?? '')}</textarea></div>
      ${ms.length ? `<h3 class="mentions-head">In the guide · ${ms.length} mention${ms.length > 1 ? 's' : ''}</h3>
        ${ms.map(mentionHtml).join('')}` : ''}`;
    el.querySelectorAll('.mention').forEach((card, i) => mark(card.querySelector('.excerpt'), p.name, ms[i].anchor));
    $('.body').scrollTop = 0;
  }

  function open(place, alsoHere = []) {
    current = place; others = alsoHere;
    renderHead(); renderBody();
    el.hidden = false;
    document.body.classList.add('sheet-open');  // floating controls step aside
    requestAnimationFrame(() => el.classList.add('open'));
  }
  function close() {
    el.classList.remove('open', 'full'); el.hidden = true; current = null;
    document.body.classList.remove('sheet-open');
    onClose();
  }

  return { open, close, get current() { return current; }, height: () => (el.hidden ? 0 : el.offsetHeight) };
}
