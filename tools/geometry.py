"""Fetch OSM outlines via Nominatim lookup, cached in data/private/geometry.json.

fetch_shapes(["R123", "W456"]) -> {"R123": GeoJSON geometry, ...}
Simplified (polygon_threshold) and rounded to 5 decimals to keep the data small.
"""
import json, time, urllib.request
from pathlib import Path

CACHE = Path(__file__).resolve().parent.parent / "data" / "private" / "geometry.json"
URL = "https://nominatim.openstreetmap.org/lookup?osm_ids={}&format=geojson&polygon_geojson=1&polygon_threshold=0.0002"


def _round(c):
    return [_round(x) for x in c] if isinstance(c[0], list) else [round(c[0], 5), round(c[1], 5)]


def fetch_shapes(ids):
    cache = json.loads(CACHE.read_text()) if CACHE.exists() else {}
    todo = sorted({i for i in ids if i not in cache})
    for k in range(0, len(todo), 40):
        batch = todo[k:k + 40]
        req = urllib.request.Request(URL.format(",".join(batch)), headers={"User-Agent": "LP-map-personal"})
        data = json.load(urllib.request.urlopen(req, timeout=60))
        got = {}
        for f in data.get("features", []):
            pr = f["properties"]
            key = pr["osm_type"][0].upper() + str(pr["osm_id"])
            g = f["geometry"]
            if g["type"] in ("Polygon", "MultiPolygon", "LineString", "MultiLineString"):
                got[key] = {"type": g["type"], "coordinates": _round(g["coordinates"])}
        for i in batch:
            cache[i] = got.get(i)  # None = no usable outline; don't ask again
        time.sleep(2)
    if todo:
        CACHE.write_text(json.dumps(cache))
    return {i: cache.get(i) for i in ids}
