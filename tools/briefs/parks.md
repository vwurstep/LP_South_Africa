# Brief: parks with an entrance fee — fees and practical info

For a personal travel map app used on a self-drive trip through South Africa (Cape Town →
Johannesburg, with detours; possibly Lesotho and eSwatini) by INTERNATIONAL (non-SADC) visitors.
Working dir: the repo root (/Users/philippevonwurstemberger/Documents/Github Projects/LP_South_Africa).

Existing places on the map that may be parks: data/private/web/park_candidates.json
({name, kind, category, subcategory, chapter, lat, lng, has_outline}). Match to these whenever
it is the same park/section, so the fee is attached to the existing pin/outline instead of
creating a duplicate.

Output: the file named in your task, format:
{"by": "Web research", "date": "<today>", "items": [ITEM, ...], "notes": [{"title": "...", "text": "...", "sources": [...]}]}
ITEM = {
  "name": "Addo Elephant National Park",   // official name
  "lp_match": "exact name from park_candidates.json" | null,
  "park": "national" | "reserve",          // national = a national park (or a section of one, e.g. Cape of Good Hope in Table Mountain NP);
                                           // reserve = provincial / other public or private park or reserve with an entry fee
  "operator": "SANParks" | "Ezemvelo KZN Wildlife" | "CapeNature" | ...,
  "kind": "area" | "point",                // area if it has a sensible OSM outline, else point (e.g. a gate / pay point)
  "osm": "R123" | "W123" | null,           // only for new areas (lp_match null): OSM relation/way of the park outline (Photon search, see below)
  "lat": .., "lng": ..,                    // representative point (main gate / pay point for points)
  "category": "sight",
  "subcategory": "national park" | "game reserve" | "nature reserve" | "national park section" | ...,
  "fees": {
    "currency": "ZAR",
    "adult": 000, "child": 000,            // INTERNATIONAL visitor, per person per day (the "conservation fee" / entry fee); child = the official child rate
    "child_note": "2–11 years" | null,
    "per": "person per day",
    "other": "SA residents R…, SADC R… (short)",   // optional
    "vehicle": "R… per vehicle" | null,    // only if charged
    "wildcard": true | false,               // SANParks / CapeNature / Ezemvelo Wild Card accepted?
    "valid": "1 Nov 2025 – 31 Oct 2026",   // the tariff period you found (SANParks tariffs change every 1 Nov — if 2026/27 rates from 1 Nov 2026 are already published, use those and say so)
    "checked": "<today>"
  },
  "comment": "2–4 sentences, plain text: what the fee covers, gate/opening times, whether to book ahead (e.g. Kruger day visitor quotas, Boulders boardwalk), cash/card, anything else a visitor must know (e.g. activities cost extra, malaria area, high-clearance roads). Your own words.",
  "sources": [{"title": "...", "url": "https://..."}],   // 1–3, official tariff pages/PDFs preferred
  "confidence": "high" | "medium" | "low"
}

Research: use web search and fetch official pages first (sanparks.org tariff pages/PDFs; capenature.co.za;
kznwildlife.com; parks operators' sites; Big Game Parks / eSwatini National Trust Commission; Lesotho
parks), then reputable travel sources only if no official figure exists (confidence medium/low then).
Don't invent numbers: if you can't find a fee, set adult/child null and say so in the comment.
Location / outline: Photon geocoder (https://photon.komoot.io/api/?q=...), NOT Nominatim; max 1 request/second
from a Python script. Validate the JSON with Python (schema, coordinates lat -35..-22, lng 16..33).
Do the work yourself in this session — don't spawn subagents. Scratch files in data/private/web/work-parks-<your part>/.
Final reply: a list name | park | adult/child fee | wildcard | confidence, plus anything notable — under 200 words.
