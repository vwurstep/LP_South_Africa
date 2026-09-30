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
  - **UI (built 2026-09-30 from design rounds 2 and 3):**
    - The top holds only a frosted search bar.
    - A floating glass bar at the bottom (`#dock`) has Filter (with the count), Saved
      (favourites only), Routes (routes only) and ＋.
    - A slim stack on the right above it (`#side`) has the compass, shown only when the
      map is rotated, and my location, blue while following. Both hide while the place
      panel is open.
    - **Adaptive pins** (`src/map.js`, 2026-09-30): each visible dot gets `iz` (the zoom
      from which it shows as an icon disc) and `lz` (the zoom from which it shows its
      name). Both come from the distance to its nearest visible neighbour: ICON_GAP 26 px
      and LABEL_GAP 64 px of free screen space. All dots expand from zoom 12 and all names
      show from zoom 14. Nothing expands below zoom 5 (icons) or 6 (names). The layers use
      zoom filters, `['>=', ['zoom'], ['get','iz']]`, which are evaluated per tile zoom.
      Names use variable anchors and avoid icons (`icon-ignore-placement: false`). The
      selection ring is sized to the dot or the disc (two layers). Favourites get a gold
      ring, and only friends' tips get a dark ring (not web tips). Tuning = the constants
      at the top of map.js.
    - **Sight subcategories** (2026-09-30): `tags` from `data/private/tags/sights.json`,
      made by an agent from name, subcategory and summary. A sight can have several tags,
      e.g. Castle of Good Hope = museum + history; the first tag decides the pin emoji.
      Definitions (label + emoji) are `SIGHT_TAGS` in `src/data.js`. The filter facet
      "Kind of sight" applies to sight dots only; untagged sights always pass. New sights
      from later chapters or friends need tagging, and the build prints "N sights without
      tags".
    - The page runs under the iOS status bar (`black-translucent`) with a faint top scrim.
      This status bar setting only takes effect when the app is re-added to the home
      screen. That leaves the known iOS gap at the bottom (window shifted up, not made
      taller): `fitScreen()` in app.js measures it, sets `--app-extra`, and the map, dock,
      side stack, sheet and filter panel extend into it. It only applies in standalone
      portrait with safe-area-top > 0.
      Before that, iOS 26 tinted the band above the frosted search bar grey.
    - The panel has a Directions / Save / Note row. Directions goes to coordinates, or by
      name when the position is only a guess.
  - **Night mode** (`src/theme.js`): Auto / Day / Night in the menu. Auto uses sunset and
    sunrise at the last GPS fix or map centre, computed offline. Night sets
    `<html data-theme="night">` (CSS tokens) and swaps the map to OpenFreeMap "dark",
    which uses the same tiles, fonts and sprites, so offline saves cover both. Our map
    layers are re-added on every `style.load`.
  - `src/filters.js` is the filter model: independent facets "Show" (dots / areas /
    routes), "Type" (applies to dots only) and "Source" (Lonely Planet / each friend /
    road trips / my places). A place is visible if it matches every facet. The options
    come from the data, and the saved state lists the options that are OFF, so new
    friends or categories appear switched on. The UI is the ⚲ Filter button + panel in
    `app.js`, with Select all / Deselect all and All / None per facet. Tapping
    "N shown" zooms to the shown places.
- **Guide text is copyrighted, so it is never published in plain text.** A GitHub Pages
  site is public even when the repo is private. The pipeline writes plaintext to
  `data/private/` (gitignored) and publishes only `data/guide.enc.json`, which is
  AES-GCM encrypted with a key derived via PBKDF2 from a passphrase. The app asks for
  the passphrase once and stores it on the device. On 2026-09-30 Phil chose a short
  passphrase (a single word, in `data/private/passphrase.txt`). It is compared
  case-insensitively: the app and the tools lowercase it. It only needs to keep the text
  from being publicly readable or indexed. Old versions in git history stay encrypted
  with the previous long passphrase. The app asks for the passphrase only when it is
  missing or wrong. A failed download shows "Retry" instead. The ebook itself (`*.epub`) and the
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
- **Web research (scenic drives)**: `data/private/web/*.json` has the same format as the
  friends files, plus `sources: [{title, url}]` per item. A rec there has `type: "web"` and
  shows as "Road trip" with source links. On 2026-09-29 an agent researched about 15 drives
  for the Cape Town → Johannesburg trip, including Swartberg, the Seven Passes Road,
  Baviaanskloof, Abel Erasmus… It left out Meiringspoort, closed after the May 2026 floods.
  The **Routes** chip filters to all lines.
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
   earlier summary. A full check of all summaries runs with brief `tools/briefs/qa.md`
  (batches `qa-batch-NN.json` → `fix-qa-NN.json`). A check on 2026-09-29 of 148 sampled summaries (areas weighted
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
              tags?: [museum|history|nature|coast|wildlife|views|wine|city],  // sights only
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
- **Before every push that changes app files or data, run `python3 tools/release.py`.**
  It stamps `version.json` and the `CACHE` name in `sw.js`. On open or resume, the app
  compares its version with the server's and shows "↻ Update available". Tapping it
  clears the app caches (not the tiles or user data) and reloads. Menu →
  "Check for updates" does the same by hand. The service worker revalidates
  (`cache: 'no-cache'`) because GitHub Pages sends max-age=600.
- Visual checks: Playwright WebKit with the iPhone 13 device profile, script in
  `$TMPDIR/pw` (see memory). Headless Chrome CLI screenshots come out with an empty map.
- **Design exploration** (Phil wants to see proposals as images before anything is built):
  `tools/design/mock.mjs` re-skins the running app per variant (injected CSS, a map-style
  swap, pin restyling via `window.__lp.mapView.map`) and takes iPhone screenshots. The
  results go on a private comparison page (artifact "Guide Map Looks",
  https://claude.ai/artifact/AywtwCbNoYtz7RisD3SmHD). Round 1 (2026-09-30): A Refined,
  B Brown sign, C Night drive, D Map first + bottom bar. Round 2 (`tools/design/mock2.mjs`) uses
  Phil's picks: the current liberty map; A's icon pins with names when zoomed in; A's frosted
  search; a Directions/Save/Note row; auto night mode (sunset/sunrise) with a manual switch;
  controls at the bottom (options: floating glass bar / search at bottom / corner buttons).
  He found D's tab bar too old-fashioned and chose option 1, the floating glass bar. Round 3
  (`tools/design/mock3.mjs`): where location and compass go. The compass shows only when the map is rotated. Options: A a stack
  above the bar, B location in the bar, C location in the search bar.
- Local run: `python3 -m http.server 8000` in the repo root, then open
  http://localhost:8000.
