"""Look up every point place on Google Places (New) Text Search, cache in data/private/google.json.

Usage: python3 tools/google_places.py [--limit N] [--redo]
Key: data/private/google_api_key.txt (gitignored). Only places not yet in the cache
are queried, so re-running is cheap. Then re-run tools/build_data.py to merge.

Rating fields use the "Text Search Enterprise" SKU; Google's free monthly allowance
covers about 1,000 of those calls, so run this once per new chapter, not repeatedly.
"""
import json, math, re, sys, time, unicodedata, urllib.request
from difflib import SequenceMatcher
from pathlib import Path

PRIV = Path(__file__).resolve().parent.parent / "data" / "private"
KEY = (PRIV / "google_api_key.txt").read_text().strip()
CACHE = PRIV / "google.json"
FIELDS = "places.id,places.displayName,places.rating,places.userRatingCount,places.googleMapsUri,places.location,places.formattedAddress"


def norm(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def dist_km(lat1, lng1, lat2, lng2):
    x = math.sin(math.radians(lat2 - lat1) / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(math.radians(lng2 - lng1) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(x))


def search(p):
    body = {"textQuery": f'{p["name"]}, Cape Town, South Africa', "maxResultCount": 3,
            "locationBias": {"circle": {"center": {"latitude": p["lat"], "longitude": p["lng"]}, "radius": 5000.0}}}
    req = urllib.request.Request("https://places.googleapis.com/v1/places:searchText", data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json", "X-Goog-Api-Key": KEY, "X-Goog-FieldMask": FIELDS})
    return json.load(urllib.request.urlopen(req, timeout=30)).get("places", [])


def best(p, results):
    """Pick the result that is clearly the same place (similar name, not too far away)."""
    maxd = 3 if p["geo"].get("confidence") == "high" else 15
    scored = []
    for r in results:
        n1, n2 = norm(p["name"]), norm(r["displayName"]["text"])
        sim = max(SequenceMatcher(None, n1, n2).ratio(), 1.0 if n1 in n2 or n2 in n1 else 0)
        d = dist_km(p["lat"], p["lng"], r["location"]["latitude"], r["location"]["longitude"])
        if sim >= 0.6 and d <= maxd:
            scored.append((sim - d / 50, r, d))
    return max(scored, key=lambda x: x[0]) if scored else None


def main():
    args = sys.argv[1:]
    limit = int(args[args.index("--limit") + 1]) if "--limit" in args else None
    guide = json.loads((PRIV / "guide.json").read_text())
    cache = json.loads(CACHE.read_text()) if CACHE.exists() else {}
    todo = [p for p in guide["places"] if p["kind"] == "point" and ("--redo" in args or p["id"] not in cache)]
    todo = todo[:limit] if limit else todo
    print(f"{len(todo)} places to look up")
    for i, p in enumerate(todo):
        try:
            results = search(p)
        except Exception as e:  # keep going; failed ones are retried next run
            print("error", p["name"], e); continue
        b = best(p, results)
        entry = {"match": bool(b), "query": p["name"], "candidates": [r["displayName"]["text"] for r in results]}
        if b:
            r, d = b[1], b[2]
            entry.update(id=r["id"], name=r["displayName"]["text"], rating=r.get("rating"), count=r.get("userRatingCount"),
                         uri=r.get("googleMapsUri"), lat=r["location"]["latitude"], lng=r["location"]["longitude"],
                         address=r.get("formattedAddress"), dist_km=round(d, 2))
        cache[p["id"]] = entry
        if i % 20 == 0:
            CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=0))
        time.sleep(0.1)
    CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=0))
    m = sum(1 for v in cache.values() if v["match"])
    print(f"cache: {len(cache)} places, {m} matched")


if __name__ == "__main__":
    main()
