# LP South Africa map

Personal travel app for Phil's South Africa trip. It shows the Lonely Planet
recommendations (from the ebook Phil owns) as pins on a map with the user's live
location. Tapping a pin shows a short summary of what the book says about the place, then a
list of every mention in the book: the paragraph itself, with the full section
expandable. Phil found the first version, which showed whole sections one per swipe,
confusing. Phil can also add his own pins (e.g. things
found on Google Maps). It has to work **offline on a phone**.

Scope right now: **Cape Town chapter only**, used to iterate on the look and feel.
Other chapters come later with the same pipeline.

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
- **User data lives on the device** (localStorage via `src/data.js`), with export/import
  as JSON so it can be backed up or moved to another device. There is no server.
  Adding a pin: long-press the map, use "here" (GPS), or paste coordinates or a Google
  Maps URL containing `@lat,lng`, `?q=lat,lng` or `!3d..!4d..`. Short `maps.app.goo.gl`
  links can't be resolved offline or client-side (CORS), so open them first and copy
  the full URL.

## Data pipeline (per chapter)

1. `tools/extract_chapter.py <xhtml> <chapter-id> data/private/<chapter-id>` is
   deterministic. It writes `sections.json` (cleaned HTML text blocks in book order,
   split at headings) and `candidates.json` (every place mention: poi spans, stays, map
   legend entries with their category).
2. **Subagents** (one per group of neighbourhoods, run in parallel, sonnet is enough)
   dedupe, classify and geocode the candidates into `batches/<X>.places.json`. Geocoding
   uses Photon first, then Nominatim at ≤1 req/s, then knowledge. Each place records
   `geo.confidence`. Splitting the work this way keeps the main session from reading the
   whole book.
3. `tools/build_data.py` merges the batches, dedupes across batches, turns candidates
   into mentions, adds text-match mentions from the book's general chapters (Our Picks,
   Itineraries, Food…), and writes `data/private/guide.json`.
   It also cuts the paragraph(s) of each mention (`excerpt`) and applies manual
   duplicate merges from `data/private/<chapter>/merge.json`.
   Places that still need a summary are written to `data/private/summaries/in-N.json`.
   **Subagents** turn those into 1–3 sentence summaries (`out-N.json`, `{id: text}`),
   using only the excerpts. Re-run the build afterwards to pick them up. Place ids are
   `slug(name)-hash(name+lat)`, so they stay stable across rebuilds.
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
              geo:{source, confidence, note},
              mentions:[{section, anchor|null, label?, excerpt}]}] }
```
`category` is one of: sight, activity, eat, drink, sleep, shop, info, transport.
User places use the same place shape with `user: true`, an optional `note`, and no
mentions.

## Working style

- Phil wants to iterate on the look. Keep the UI simple and easy to change.
- Use subagents for bulk book reading and geocoding. Don't read whole chapters in the
  main session.
- Bump `CACHE` in `sw.js` whenever app files change.
- Visual checks: headless Chrome screenshots from Bash (see `tools/` or memory).
- Local run: `python3 -m http.server 8000` in the repo root, then open
  http://localhost:8000.
