"""Fetch all hospitals in South Africa, Lesotho and eSwatini from OpenStreetMap (Overpass API).

Usage: python3 tools/fetch_hospitals.py      -> data/private/osm/hospitals.json (cached raw data)
Then re-run tools/build_data.py, which turns them into places (category "health", source "osm").
Data © OpenStreetMap contributors, ODbL.
"""
import json, urllib.parse, urllib.request
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "data" / "private" / "osm" / "hospitals.json"
QUERY = """
[out:json][timeout:240];
( area["ISO3166-1"="ZA"][admin_level=2]; area["ISO3166-1"="LS"][admin_level=2]; area["ISO3166-1"="SZ"][admin_level=2]; )->.a;
( nwr["amenity"="hospital"](area.a); nwr["healthcare"="hospital"](area.a); );
out center tags;
"""
SERVERS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]

for url in SERVERS:
    try:
        req = urllib.request.Request(url, data=urllib.parse.urlencode({"data": QUERY}).encode(),
                                     headers={"User-Agent": "LP-map-personal"})
        data = json.load(urllib.request.urlopen(req, timeout=300))
        break
    except Exception as e:
        print("failed", url, e)
else:
    raise SystemExit("all Overpass servers failed")

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(data, ensure_ascii=False))
print(len(data.get("elements", [])), "elements ->", OUT)
