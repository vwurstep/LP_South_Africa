---
name: add-recommendations
description: Add a friend's travel recommendations (pasted message) to the map — extract places/areas/routes, geolocate them, attach the friend's comment and name, rebuild, publish.
---

# Add a friend's recommendations to the map

Input: the friend's name and their message (the user pastes it). If the name is missing, ask.

1. Save the message verbatim to `data/private/friends/<friend-slug>-<YYYY-MM-DD>.txt`
   (gitignored — friends' messages are never published in plain text).
2. Refresh the list of existing names so matches can be found:
   `python3 -c "import json;g=json.load(open('data/private/guide.json'));json.dump(sorted({p['name'] for p in g['places']}),open('data/private/lp_place_names.json','w'),ensure_ascii=False)"`
3. Spawn ONE subagent (model sonnet) with the brief below, filled in. Don't do the geocoding
   in the main session.
4. When it's done: `python3 tools/build_data.py` → if it reports places needing summaries,
   spawn summary subagent(s) as described in CLAUDE.md, re-run the build →
   `node tools/encrypt.mjs` → bump `CACHE` in `sw.js` → commit + push
   (the commit message names the friend; the message itself stays private).
5. Report back: what was added as new pins/areas/routes, what was attached to existing
   guide places, anything that couldn't be located.

## Subagent brief (fill in FRIEND, DATE, FILE)

> Turn a friend's travel-recommendation message into structured, geolocated map items.
> Working dir: the repo root. Input: `data/private/friends/FILE.txt` (friend FRIEND, date DATE).
> Existing place names (exact spelling): `data/private/lp_place_names.json`.
> Output: `data/private/friends/FILE.json` =
> `{"by": FRIEND, "date": DATE, "items": [ITEM...]}` with
> `ITEM = {name, kind: point|area|route, category: sight|activity|eat|drink|sleep|shop|area,
> subcategory, comment (the friend's own words about it, trimmed), lat, lng,
> osm: "R123"|"W123"|null (area outline), line: [[lng,lat],...]|null (route),
> lp_match: exact existing name|null, geo: {source, confidence}}`.
> - One item per distinct recommendation; general tips go into the comment of the most
>   fitting item; don't invent places the friend didn't mean.
> - Venues → point (find via web search + Photon `https://photon.komoot.io/api/?q=…`).
> - Towns/neighbourhoods/reserves → area with an OSM relation id from Nominatim
>   (`https://nominatim.openstreetmap.org/search?q=…&format=json`, User-Agent
>   "LP-map-personal", max 1 request / 2 s from a Python script; verify with `/lookup?osm_ids=`).
> - Drives/hikes with start and end → route; line from OSRM
>   `https://router.project-osrm.org/route/v1/driving/LNG1,LAT1;LNG2,LAT2?overview=simplified&geometries=geojson`
>   (add waypoints to force the right road; round to 5 decimals, ≤300 points).
> - If an item is the same as an existing place, set `lp_match` (the comment is then attached
>   to that place instead of creating a duplicate pin).
> - Validate the JSON with Python. Reply with a short list: name | kind | lp_match | confidence.

The build (`tools/build_data.py`) turns items into places with `source: "friend"`, or appends
`{by, date, comment}` to `recs` of the matched place, and fetches OSM outlines via
`tools/geometry.py` (cached in `data/private/geometry.json`).
