# LP South Africa map

Personal travel app for Phil's South Africa trip. It shows the Lonely Planet
recommendations (from the ebook Phil owns) as pins on a map with the user's live
location. Tapping a pin shows a short summary of what the book says about the place, then a
list of every mention in the book: the paragraph itself, with the full section
expandable. Phil found the first version, which showed whole sections one per swipe,
confusing. Phil can also add his own pins (e.g. things found on Google Maps) and
friends' recommendations (pasted messages, turned into pins/areas/routes by the
`/add-recommendations` skill). Areas (neighbourhoods, towns, reserves) show as
outlines and routes (scenic drives) as lines, next to the dots. It has to work
**offline on a phone**.

Scope: **the whole guide**. Cape Town was built first to settle the look. On 2026-09-28
all 14 regional chapters (`tools/chapters.json`) went through the same pipeline: about
1,745 places, including about 190 areas and 11 routes, with 130 outlines. About 470 places
have only an approximate position (`geo.confidence: low`), mostly small businesses not in
OSM that sit at the town centre.
Build dedupe rules: the same name within 1.5 km is one place; within one chapter, within
40 km (60 km if either position is a guess). An area or route item matches a same-named
point within 150 km, so a park's gate dot gets the park outline.

## TODO (open)

- **Sync setup (Phil):** he hasn't created the GitHub token yet. He wants his
  notes/stars kept between updates. They already survive updates (localStorage), but the
  backup to the `userdata` branch needs the token pasted in ☰ → Backup & sync. Remind
  him.
- **Google ratings (optional):** Phil might not need them. Needs a Places API key in
  `data/private/google_api_key.txt`, then `tools/google_places.py`.

## Decisions (and why)

- **PWA on GitHub Pages**, the same setup as `../Phils_2048`: plain HTML/CSS/JS, no build
  step or framework. It installs to the home screen ("Add to Home Screen" in iOS Safari)
  and a service worker (`sw.js`) caches it for offline use.
- **Data kept separate from how it's shown.** All content is JSON in `data/` with the
  schema below. The app (`src/`) only reads that schema, so a website or another
  frontend can reuse the data later.
  - `src/data.js` is the data access layer (load/decrypt guide, user places, notes/favs).
    No DOM or map code goes in it.
  - `src/map.js` handles the map, `src/sheet.js` the reading panel, and `src/app.js` the
    wiring and UI.
- **Guide text is copyrighted, so it is never published in plain text.** A GitHub Pages
  site is public even when the repo is private. The pipeline writes plaintext to
  `data/private/` (gitignored) and publishes only `data/guide.enc.json`, which is
  AES-GCM encrypted with a key derived via PBKDF2 from a passphrase. The app asks for
  the passphrase once and stores it on the device. The ebook itself (`*.epub`) and the
  unpacked `book/` folder are gitignored too.
- **Map uses MapLibre GL + OpenFreeMap vector tiles** (free, no API key, bulk download
  allowed). `lib/maplibre-gl.*` is vendored so the app shell works offline. The service
  worker caches tiles, fonts and sprites cache-first. A "Save map offline" action
  pre-downloads the tiles for the visible area up to zoom 14, and the vector tiles
  overzoom fine past that.
- **User data (stars, notes, own pins) lives on the device** (localStorage via
  `src/data.js`). App updates don't touch it. Optional **GitHub sync** (Phil chose it)
  stores it encrypted with the same passphrase in `user.enc.json` on the **`userdata`
  branch**, not `main`, so syncs don't trigger Pages rebuilds. Phil pastes a
  fine-grained token, limited to Contents read/write on this repo, into the menu. The
  merge keeps the newest change per item: `updated` timestamps plus tombstones for
  deletions. Read Phil's data with `node tools/decrypt.mjs --userdata`. Export/import
  as JSON still exists.
  Adding a pin: long-press the map, use "here" (GPS), or paste coordinates or a Google
  Maps URL containing `@lat,lng`, `?q=lat,lng` or `!3d..!4d..`. Short `maps.app.goo.gl`
  links can't be resolved offline or client-side (CORS), so open them first and copy
  the full URL.

- **Areas and routes**: a place has `kind` point|area|route and an optional `shape`
  (GeoJSON). Points can have a shape too, e.g. Kirstenbosch has an outline plus a
  dot. Outlines come from OSM via Nominatim lookup (`tools/geometry.py`, cached), and
  route lines from OSRM (made by the agents). Click priority on the map: dot > route >
  smallest area under the finger. Other overlapping areas are listed as "Also here".
- **Friends' recommendations** go in `recs: [{by, date, comment}]` on a place. A rec that
  matches an existing guide place is attached to it instead of making a duplicate pin.
  Friends' messages stay in `data/private/friends/` and are published only inside the
  encrypted guide file.
- **Google**: each place gets a Google Maps link (its Google page when known, otherwise
  a name search). `tools/google_places.py` (key in `data/private/google_api_key.txt`)
  caches Places API matches in `data/private/google.json`. That gives rating, count,
  link, and exact coordinates for places with low geocode confidence. Rating calls are
  the "Enterprise" SKU, whose free allowance is about 1000 per month, so look up each
  place only once.

## Data pipeline

Chapters, with file, title, country and bbox, are listed in `tools/chapters.json`.
Subagent briefs live in `tools/briefs/` (`geocode.md`, `areas.md`, `summaries.md`), so
each agent prompt only says which files to process.

1. `python3 tools/extract_all.py` runs `tools/extract_chapter.py` for every chapter.
   It is deterministic. It writes `sections.json` (cleaned HTML text blocks in book order,
   split at headings) and `candidates.json` (every place mention: poi spans, stays, map
   legend entries with their category).
   It refuses to overwrite a chapter whose candidate list would change, because the
   batches refer to candidates by index.
2. **Subagents** (one per chapter or half-chapter of ~100–280 candidates, run in parallel,
   sonnet is enough, brief `tools/briefs/geocode.md`) dedupe, classify, set `locality` and
   geocode the candidates into `batches/<X>.places.json`. Parallel agents use **Photon
   only** (≤1 req/s each). Nominatim allows 1 req/s in total, so only the single-threaded
   build uses it, for outlines. Each place records
   `geo.confidence`. Splitting the work this way keeps the main session from reading the
   whole book.
3. `tools/build_data.py` merges the batches, dedupes across batches, turns candidates
   into mentions, adds text-match mentions from the book's general chapters (Our Picks,
   Itineraries, Food…), and writes `data/private/guide.json`.
   It also cuts the paragraph(s) of each mention (`excerpt`) and applies manual
   duplicate merges from `data/private/<chapter>/merge.json`.
   Places that still need a summary are written to
   `data/private/summaries/todo-<stamp>-NN.json` (150 per file). **Subagents** (brief
   `tools/briefs/summaries.md`) turn those into 1–3 sentence summaries
   (`done-<stamp>-NN.json`, `{id: text}`; older ones are `out-*.json`),
   using only the excerpts. Re-run the build afterwards to pick them up. Place ids are
   `slug(name)-hash(name+lat)`, so they stay stable across rebuilds.
   Areas/routes of the chapter: `data/private/<chapter>/areas.json` (made by an agent with
   brief `tools/briefs/areas.md`:
   name as in the book, kind, OSM id or line, `lp_match` to put a shape on an existing point).
   Friends: `data/private/friends/*.json` (see `.claude/skills/add-recommendations`).
   Optional: `python3 tools/google_places.py`, then re-run the build.
   **QA:** `data/private/summaries/fix-*.json` (`{id: corrected summary}`) overrides every
   earlier summary. A check on 2026-09-29 of 148 sampled summaries (areas weighted
   heavily) found about 8% with a real error. Typical errors are a detail taken from a
   neighbouring place in the same paragraph, or an invented specific. Areas are the
   riskiest. Always give QA agents the **full** excerpts: truncated ones produce false
   "invented" flags. Report: `data/private/summaries/qa2-20260929-report.md`.
4. `node tools/encrypt.mjs` writes `data/guide.enc.json` (passphrase from
   `data/private/passphrase.txt`).

Ebook layout: `book/EPUB/ebook-NN-*.xhtml`, one file per chapter. `span.poi[id=poiss-N]`
marks a place, `p.wh-stay` a stay, `div.map-keys-poi` a map legend entry under
`p.map-key-head` (category), and `a#page_N` the print page.

## Schema (`guide.json`)

```
{ meta: {title, built, chapters:[...]},
  sections: [{id, chapter, area, title, parent, level, page, anchor, html}],
  places:   [{id, name, category, subcategory, area, top, price, lat, lng, summary,
              kind: point|area|route, shape?: GeoJSON, source: lp|friend,
              recs: [{by, date, comment}], google?: {id, rating, count, uri},
              geo:{source, confidence, note},
              mentions:[{section, anchor|null, label?, excerpt}]}] }   // max 12 mentions
```
`category` is one of: sight, activity, eat, drink, sleep, shop, area, info, transport.
User places use the same place shape with `user: true`, an optional `note`, and no
mentions.

## Working style

- Phil wants to iterate on the look. Keep the UI simple and easy to change.
- Use subagents for bulk book reading and geocoding. Don't read whole chapters in the
  main session.
- Bump `CACHE` in `sw.js` whenever app files change.
- Visual checks: Playwright WebKit with the iPhone 13 device profile, script in
  `$TMPDIR/pw` (see memory). Headless Chrome CLI screenshots come out with an empty map.
- Local run: `python3 -m http.server 8000` in the repo root, then open
  http://localhost:8000.
