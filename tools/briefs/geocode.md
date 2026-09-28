# Brief: dedupe, classify and geocode guidebook place mentions

You turn place mentions extracted from one chapter of a Lonely Planet guide (South Africa,
Lesotho & eSwatini) into a clean, geocoded place list for a personal map app.
Working dir: the repo root (/Users/philippevonwurstemberger/Documents/Github Projects/LP_South_Africa).
Chapter metadata (title, country, rough bounding box [south, west, north, east]): tools/chapters.json.

Input: data/private/<chapter>/batches/<batch>.json — JSON array of candidates, each with a
unique integer `idx`. Output: data/private/<chapter>/batches/<batch>.places.json.

Candidate kinds:
- "poi": a place highlighted in the text (`context` = the paragraph it appears in)
- "poi-ref": a link to a poi elsewhere (same place as the poi with that `anchor`)
- "stay": an accommodation recommendation (has `price`)
- "listed": a short listed recommendation
- "mapkey": an entry in a map legend; `mapCategory` (SIGHTS, EATING, DRINKING, SLEEPING,
  SHOPPING, ACTIVITIES…, INFORMATION, TRANSPORT) tells you what it is. No context.
`area` is the town/sub-region section of the chapter the mention sits in ("Beyond X" = around X).

Task:
1. Group candidates that refer to the same real place (same name, spelling variants, poi-ref
   to the same anchor, map key matching a poi). Each group = one place. Every candidate idx
   must end up in exactly one place's `candidates`, OR in top-level `skipped` if it is not a
   mappable place (a generic thing, dish, person, event without fixed venue, or a whole
   town/region/park used as context — towns and parks are handled separately as areas, so
   skip mentions that just name a town; but DO keep specific sights inside parks, e.g. a
   waterfall, a camp, a viewpoint, a gate). Small sub-features of a larger site merge into
   the parent place unless they are a destination worth their own pin.
2. `category`: exactly one of sight, activity, eat, drink, sleep, shop, info, transport
   (mapCategory if present; otherwise judge: cafes/bars → drink, restaurants → eat,
   museums/beaches/viewpoints/parks' specific sights → sight, tours/hikes/operators → activity,
   lodges/camps/guesthouses → sleep). Short free-text `subcategory` ("wine estate", "rest camp").
3. `locality`: the town/suburb/park the place is in, as a short name usable in a Google
   Maps search (e.g. "Knysna", "Stellenbosch", "Kruger National Park", "Maseru").
4. Geocode to lat/lng. Use the Photon geocoder (OSM-based) — NOT Nominatim (other agents run
   in parallel; Nominatim's limit is 1 request/second in total):
   curl "https://photon.komoot.io/api/?q=<name>,+<locality>&limit=3&lat=<lat>&lon=<lon>"
   (lat/lon = a point in the chapter's region, biases results). Do the requests from a
   Python script with time.sleep(1.0) between calls. You may use web search to find an
   address, then geocode the address or the town. Use the context (town, street, park) to
   pick the right match; reject matches far outside the region. If nothing works, use your
   own knowledge or the town centre and mark confidence low.
   `geo`: {"source": "photon"|"address"|"knowledge"|"town", "confidence": "high"|"medium"|"low", "note"?}
   high = exact named match where expected; medium = street address / plausible; low = approximate.

Output (valid JSON, UTF-8, keep the book's spelling incl. curly apostrophes):
{"places": [{"name": "…", "category": "sight", "subcategory": "…", "locality": "…",
   "top": false, "lat": -33.9, "lng": 18.4, "geo": {…}, "price": null, "candidates": [0, 3]}],
 "skipped": [{"idx": 5, "reason": "town name"}]}
`top` = true if a candidate had mapCategory "TOP SIGHTS". `price` = "$"/"$$"/"$$$" if given.

Before finishing, run a Python check: every input idx appears exactly once across
places[].candidates and skipped[]; categories valid; coordinates inside the chapter bbox
(allow ~0.5° slack for "Beyond" places; list any outside and double-check them).
Final reply: counts only (places per category, skipped, low-confidence) — under 80 words.

Do the work yourself in this session — do not spawn subagents or forks (parallel helpers
have raced on the same output files before).
