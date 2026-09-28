# Brief: areas (towns, parks, regions) and routes of a guidebook chapter

Identify the areas and routes that a Lonely Planet chapter describes as destinations, and
find their OpenStreetMap outlines, for a personal map app. Areas are shown as outlines,
routes as lines, next to the venue dots (which other agents handle).
Working dir: the repo root (/Users/philippevonwurstemberger/Documents/Github Projects/LP_South_Africa).
Chapter metadata (title, country, bbox [south, west, north, east]): tools/chapters.json.

Input per chapter: data/private/<chapter>/sections.json — array of {id, area, title, parent,
html}. Read with Python; skim titles and the `area` values (the chapter's town/sub-region
sections), grep plain text (strip tags) for place names. Don't print whole files.
data/private/<chapter>/candidates.json lists the venue names already handled as dots.
Output per chapter: data/private/<chapter>/areas.json

Format: {"items": [ITEM, ...]}
ITEM = {
  "name": "Knysna",               // exactly as the book writes it (it is text-matched in the book)
  "kind": "area" | "route",
  "category": "area" | "sight" | "activity",  // towns/regions/valleys → area; national parks,
                                              // reserves, gardens → sight; drives/trails → activity
  "subcategory": "town",          // short free text: town, national park, wine valley, game reserve…
  "lat": .., "lng": ..,           // representative point (centre)
  "osm": "R1234" | "W1234" | null,// OSM relation/way outlining it (kind area); null if none
  "line": [[lng,lat],...] | null, // kind route only
  "lp_match": "exact candidate name" | null,  // if the same thing is also a venue candidate
                                  // (e.g. a park that is also listed as a sight) — it then gets
                                  // the outline in addition to its dot
  "book_area": "the section `area` it belongs to" | null,
  "geo": {"source": "...", "confidence": "high"|"medium"|"low"}
}

Include (roughly 10–30 per chapter, quality over quantity):
- Every town/village/city that has its own section in the chapter (the `area` values, minus
  "Beyond …" wrappers), plus towns the text clearly presents as destinations.
- National parks, nature/game reserves, wetland parks, botanical gardens, wine valleys and
  mountain ranges the chapter describes as destinations — if OSM has a sensible outline.
- Big cities: the city itself plus the neighbourhoods the chapter has sections for.
- Routes the book describes with clear start and end (scenic drives, passes, famous trails):
  line from OSRM, e.g. curl "https://router.project-osrm.org/route/v1/driving/LNG1,LAT1;LNG2,LAT2?overview=simplified&geometries=geojson"
  (add waypoints to force the right road; foot profile for trails if it works; if no road
  exists, e.g. a multi-day hiking trail, give a rough line of 5–20 points from your
  knowledge and mark confidence low). Round to 5 decimals, ≤ 300 points.

OSM ids: use Photon (NOT Nominatim — other agents run in parallel):
  curl "https://photon.komoot.io/api/?q=Knysna&limit=5&lat=<lat>&lon=<lon>"
Each result has properties osm_type ("R" relation, "W" way, "N" node), osm_id, osm_key,
osm_value, extent. Prefer R/W results with osm_key place (city/town/village/suburb) or
boundary (administrative/national_park/protected_area) or leisure=nature_reserve, whose
extent is plausible for the thing. A node (N) has no outline → osm null, confidence of the
outline low (the point is still used). Put requests in a Python script with time.sleep(1.0).
The outline itself is downloaded later by the build (tools/geometry.py) — don't fetch it.

Validate the JSON with Python (schema, ids match ^[RW]\d+$ or null, coordinates within the
chapter bbox plus ~0.5° slack). Final reply per chapter: items by kind, how many with an
outline — under 80 words total.
