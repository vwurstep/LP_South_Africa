"""Merge subagent batches into data/private/guide.json.

Usage: python3 tools/build_data.py
Reads data/private/<chapter>/{sections,candidates}.json and batches/*.places.json
for every chapter in tools/chapters.json that has geocoded batches, plus sections of
the general chapters (for extra text-match mentions). See CLAUDE.md for the schema.
"""
import json, math, re, subprocess, sys, unicodedata, hashlib, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PRIV = ROOT / "data" / "private"
EPUB = ROOT / "book" / "EPUB"
CHAPTER_META = {c["id"]: c for c in json.loads((ROOT / "tools/chapters.json").read_text())}
# a chapter is included once at least one of its batches has been geocoded
CHAPTERS = [c for c in CHAPTER_META if list((PRIV / c / "batches").glob("*.places.json"))]
# general chapters searched for extra mentions of places by exact name
GENERAL = ["02-welcome", "04-our-picks", "05-regions", "06-itineraries", "07-when-to-go",
           "08-get-prepared", "09-food-scene", "10-how-to", "11a-outdoors", "11b-action",
           "26b-toolkit"]
CATEGORIES = {"sight", "activity", "eat", "drink", "sleep", "shop", "info", "transport"}


def norm(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"^the\s+", "", s)
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def slug(s):
    return norm(s).replace(" ", "-")[:40]


def dist_km(a, b):
    dlat = math.radians(b["lat"] - a["lat"]); dlng = math.radians(b["lng"] - a["lng"])
    x = math.sin(dlat / 2) ** 2 + math.cos(math.radians(a["lat"])) * math.cos(math.radians(b["lat"])) * math.sin(dlng / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(x))


def plain(html):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html)).replace("&amp;", "&")


# ---- sections: chapter + general -------------------------------------------
sections = []
for ch in CHAPTERS:
    sections += json.loads((PRIV / ch / "sections.json").read_text())
for g in GENERAL:
    files = sorted(EPUB.glob(f"ebook-{g}*.xhtml"))
    if not files:
        continue
    out = PRIV / "general" / g
    subprocess.run([sys.executable, str(ROOT / "tools/extract_chapter.py"), str(files[0]), f"gen-{g}", str(out)],
                   check=True, capture_output=True)
    sections += json.loads((out / "sections.json").read_text())
sec_index = {s["id"]: i for i, s in enumerate(sections)}

# ---- places from batches ---------------------------------------------------
places = []
for ch in CHAPTERS:
    cands = json.loads((PRIV / ch / "candidates.json").read_text())
    for bf in sorted((PRIV / ch / "batches").glob("*.places.json")):
        for p in json.loads(bf.read_text())["places"]:
            assert p["category"] in CATEGORIES, (bf, p["name"], p["category"])
            mentions = []
            for idx in p["candidates"]:
                c = cands[idx]
                if c["kind"] == "mapkey" or not c.get("section"):
                    continue
                anchor = c["anchor"] if c["kind"] in ("poi", "stay") else None
                mentions.append({"section": c["section"], "anchor": anchor, "label": c["name"]})
            area = next((cands[i]["area"] for i in p["candidates"] if cands[i]["area"]), None)
            places.append({
                "name": p["name"].strip(), "category": p["category"], "subcategory": p.get("subcategory"),
                "chapter": ch, "locality": p.get("locality") or ("Cape Town" if ch == "capetown" else area),
                "area": area, "top": bool(p.get("top")), "price": p.get("price"),
                "lat": round(p["lat"], 6), "lng": round(p["lng"], 6), "geo": p.get("geo", {}),
                "mentions": mentions,
            })

# merge same-named places across batches when they are close together
merged, by_name = [], {}
for p in places:
    key = norm(p["name"])
    # same place: very close, or same chapter and < 20 km (split batches geocode differently)
    def same(q):
        d = dist_km(p, q)
        if d < 1.5:
            return True
        guess = "low" in (p["geo"].get("confidence"), q["geo"].get("confidence"))
        return q["chapter"] == p["chapter"] and d < (60 if guess else 40)
    twin = next((q for q in by_name.get(key, []) if same(q)), None)
    if twin:
        rank = {"high": 0, "medium": 1}
        if rank.get(p["geo"].get("confidence"), 2) < rank.get(twin["geo"].get("confidence"), 2):
            twin.update(lat=p["lat"], lng=p["lng"], geo=p["geo"])
        twin["mentions"] += p["mentions"]
        twin["top"] = twin["top"] or p["top"]
        twin["price"] = twin["price"] or p["price"]
    else:
        merged.append(p)
        by_name.setdefault(key, []).append(p)
places = merged

for p in places:
    p.update(kind="point", source="lp", recs=[])


def find_place(name, near=None, radius=40):
    same = [q for q in places if norm(q["name"]) == norm(name)]
    if near and near.get("lat") is not None:
        same = sorted((q for q in same if dist_km(q, near) < radius), key=lambda q: dist_km(q, near))
    return same[0] if same else None


def add_shape(p, item):
    if item.get("osm"):
        p["osm"] = item["osm"]
    if item.get("line"):
        p["shape"] = {"type": "LineString", "coordinates": item["line"]}


def nearest_chapter(item):
    q = min(places, key=lambda q: dist_km(q, item))
    return q["chapter"]


def new_place(item, source, chapter):
    p = {"name": item["name"], "category": item["category"], "subcategory": item.get("subcategory"),
         "chapter": chapter, "locality": item.get("locality") or item["name"],
         "area": item.get("book_area"), "top": False, "price": None,
         "lat": round(item["lat"], 6), "lng": round(item["lng"], 6), "geo": item.get("geo", {}),
         "mentions": [], "kind": item.get("kind", "point"), "source": source, "recs": []}
    add_shape(p, item)
    places.append(p)
    return p


# areas & routes of the chapter (agent-made): data/private/<chapter>/areas.json
for ch in CHAPTERS:
    f = PRIV / ch / "areas.json"
    for item in (json.loads(f.read_text())["items"] if f.exists() else []):
        # big parks/routes: the dot (a gate or camp) can be far from the area's centre
        r = 150 if item.get("kind") != "point" else 40
        target = find_place(item["lp_match"], item, r) if item.get("lp_match") else None
        target = target or find_place(item["name"], item, r)
        if target:
            if not (target.get("shape") or target.get("osm")):
                add_shape(target, item)  # a mapped point that also gets an outline / line
        else:
            new_place(item, "lp", ch)

# recommendations (agent-made): friends' messages (data/private/friends/*.json) and web
# research such as scenic drives (data/private/web/*.json, items carry `sources`)
rec_files = [(f, "friend") for f in sorted((PRIV / "friends").glob("*.json"))] + \
            [(f, "web") for f in sorted((PRIV / "web").glob("*.json")) if f.name != "existing_routes.json"]
for f, rtype in rec_files:
    rec = json.loads(f.read_text())
    for item in rec["items"]:
        r = {"by": rec["by"], "date": rec.get("date"), "comment": item.get("comment", ""), "type": rtype}
        if item.get("sources"):
            r["sources"] = item["sources"]
        radius = 150 if item.get("kind") == "route" else 40
        target = find_place(item.get("lp_match") or item["name"], item, radius) or find_place(item["name"], item, radius)
        if not target:
            target = new_place(item, rtype, nearest_chapter(item))
        elif not target.get("shape") and not target.get("osm"):
            add_shape(target, item)
        target["recs"].append(r)

# extra mentions: exact-name text matches in sections not already linked. Venues only
# within their own chapter + the general chapters (same names recur across the country);
# areas, routes and parks anywhere in the book.
plains = {s["id"]: plain(s["html"]) for s in sections}
for p in places:
    name = p["name"]
    if len(name) < (5 if p["kind"] != "point" else 8) and " " not in name:
        continue  # too generic to text-match safely
    anywhere = p["kind"] != "point" or p.get("shape") or p.get("osm")
    pat = re.compile(r"(?<![\w’'])" + re.escape(name) + r"(?![\w’'])")
    have = {m["section"] for m in p["mentions"]}
    for s in sections:
        if s["id"] in have or name not in plains[s["id"]]:
            continue
        if not (anywhere or s["chapter"] == p["chapter"] or s["chapter"].startswith("gen-")):
            continue
        if pat.search(plains[s["id"]]):
            p["mentions"].append({"section": s["id"], "anchor": None})
            have.add(s["id"])

for p in places:
    seen, ms = set(), []
    # the place's own write-ups (marked in the text) first, then other chapter mentions,
    # then the general chapters; book order within each group
    def rank(m):
        sec = sections[sec_index[m["section"]]]
        return (norm(p["name"]) not in norm(sec["title"]),  # a section about this place
                m["anchor"] is None, sec["chapter"].startswith("gen-"),
                sec["area"] is None,                         # intro/itinerary after neighbourhood text
                sec_index[m["section"]])
    for m in sorted(p["mentions"], key=rank):
        if m["section"] not in seen:
            seen.add(m["section"]); ms.append(m)
    p["mentions"] = ms[:12]  # long lists (e.g. Table Mountain: 30) are more noise than help
    p["id"] = slug(p["name"]) + "-" + hashlib.sha1(f'{p["name"]}{p["lat"]}'.encode()).hexdigest()[:4]

# excerpt per mention: just the paragraph(s) that mention the place
from bs4 import BeautifulSoup
def excerpt(sec, anchor, names):
    soup = BeautifulSoup(sec["html"], "html.parser")
    blocks = [el for el in soup.find_all(["p", "li"]) if not el.find_parent(["p", "li"])]
    hits = [el for el in blocks if (anchor and el.find(id=anchor)) or any(n in el.get_text() for n in names)]
    return "".join(str(el) for el in hits[:2])
for p in places:
    for m in p["mentions"]:
        names = [n for n in {p["name"], m.get("label") or p["name"]} if n]
        m["excerpt"] = excerpt(sections[sec_index[m["section"]]], m["anchor"], names)
        if m.get("label") == p["name"]:
            m.pop("label")
    p["mentions"] = [m for m in p["mentions"] if m["excerpt"]]  # nothing to show -> drop

# summaries written by subagents from the excerpts (data/private/summaries/out-*.json)
SUM = PRIV / "summaries"
summaries = {}
# fix-*.json (QA corrections) come last and override earlier summaries
for f in sorted(SUM.glob("out-*.json")) + sorted(SUM.glob("done-*.json")) + sorted(SUM.glob("fix-*.json")):
    summaries.update(json.loads(f.read_text()))
# todo files without a matching done file are still being worked on by an agent: leave
# them alone and don't hand out their places again
pending = set()
for f in SUM.glob("todo-*.json"):
    if not (SUM / f.name.replace("todo-", "done-")).exists():
        pending |= {x["id"] for x in json.loads(f.read_text())}
for p in places:
    p["summary"] = summaries.get(p["id"])
missing = [p for p in places if not p["summary"] and p["mentions"] and p["id"] not in pending]
if missing:  # write agent inputs for whatever still needs a summary
    SUM.mkdir(exist_ok=True)
    stamp = datetime.datetime.now().strftime("%m%d%H%M")
    for k in range(0, len(missing), 150):
        chunk = missing[k:k + 150]
        (SUM / f"todo-{stamp}-{k // 150:02d}.json").write_text(json.dumps([{
            "id": p["id"], "name": p["name"], "category": p["category"], "subcategory": p["subcategory"],
            "area": p["area"], "region": CHAPTER_META[p["chapter"]]["title"], "price": p["price"],
            "excerpts": [plain(m["excerpt"]).strip() for m in p["mentions"] if m["excerpt"]],
        } for p in chunk], ensure_ascii=False, indent=1))
    print(f"{len(missing)} places need summaries -> {SUM}/todo-{stamp}-*.json")
if pending:
    print(f"{len(pending)} places have summaries in progress")

# manual merges of duplicates the agents kept apart: data/private/<chapter>/merge.json
# {"Canonical name": ["alias", ...]}; keeps the canonical pin, longest summary, all mentions
for ch in CHAPTERS:
    f = PRIV / ch / "merge.json"
    for canon, aliases in (json.loads(f.read_text()) if f.exists() else {}).items():
        group = [p for p in places if p["name"] in [canon, *aliases]]
        keep = next((p for p in group if p["name"] == canon), None)
        if not keep:
            continue
        for p in group:
            if p is keep:
                continue
            have = {m["section"] for m in keep["mentions"]}
            keep["mentions"] += [m for m in p["mentions"] if m["section"] not in have]
            keep["top"] = keep["top"] or p["top"]
            if len(p["summary"] or "") > len(keep["summary"] or ""):
                keep["summary"] = p["summary"]
            places.remove(p)

# subcategory tags for sights (agent-made): data/private/tags/sights.json {id: [tag, ...]}
SIGHT_TAGS = {"museum", "history", "nature", "coast", "wildlife", "views", "wine", "city"}
tf = PRIV / "tags" / "sights.json"
tags = json.loads(tf.read_text()) if tf.exists() else {}
for p in places:
    t = [x for x in tags.get(p["id"], []) if x in SIGHT_TAGS]
    if p["category"] == "sight" and t:
        p["tags"] = t
untagged = [p["name"] for p in places if p["category"] == "sight" and not p.get("tags")]
if untagged:
    print(f"{len(untagged)} sights without tags (new since tagging?), e.g. {untagged[:5]}")

# QA corrections win over everything, including summaries picked during merges above
fixes = {}
for f in sorted(SUM.glob("fix-*.json")):
    fixes.update(json.loads(f.read_text()))
for p in places:
    if p["id"] in fixes:
        p["summary"] = fixes[p["id"]]

# hospitals from OpenStreetMap (tools/fetch_hospitals.py): category "health", source "osm".
# Facts only (emergency department, phone, operator) — no guide text, so no mentions/summaries.
hf = PRIV / "osm" / "hospitals.json"
if hf.exists():
    def is_hospital(t):
        kinds = {t.get("amenity"), *(t.get("healthcare") or "").split(";")}
        name = (t.get("name") or "").lower()
        return "hospital" in kinds and not any(w in name for w in ("frail care", "old age", "pharmacy"))
    hosp = []
    for e in json.loads(hf.read_text())["elements"]:
        t = e.get("tags", {})
        lat, lng = (e.get("lat"), e.get("lon")) if "lat" in e else (e.get("center", {}).get("lat"), e.get("center", {}).get("lon"))
        if lat is None or not is_hospital(t):
            continue
        hosp.append({"t": t, "lat": lat, "lng": lng, "osm": e["type"][0] + str(e["id"])})
    # one entry per hospital: OSM often has both a point and a building outline; an unnamed one
    # next to a named one is the same hospital
    hosp.sort(key=lambda h: (not h["t"].get("name"), -len(h["t"])))
    kept = []
    for h in hosp:
        same = next((k for k in kept if dist_km(h, k) < 0.4 and
                     (not h["t"].get("name") or norm(h["t"].get("name", "")) == norm(k["t"].get("name", "")))), None)
        if not same:
            kept.append(h)
    for h in kept:
        t = h["t"]
        op_type = {"government": "public", "public/government": "public"}.get(t.get("operator:type"), t.get("operator:type"))
        spec = t.get("healthcare:speciality", "")
        emergency = {"yes": True, "no": False}.get(t.get("emergency"))
        sub = " ".join(x for x in [op_type if op_type in ("public", "private") else None,
                                   "psychiatric" if "psychiatr" in spec else None, "hospital"] if x)
        bits = [f"{sub[0].upper() + sub[1:]}" + (f" run by {t['operator']}" if t.get("operator") else "") + "."]
        if emergency is True: bits.append("Has an emergency department.")
        if emergency is False: bits.append("No emergency department.")
        if t.get("beds"): bits.append(f"{t['beds']} beds.")
        locality = t.get("addr:city") or t.get("addr:suburb") or t.get("is_in:city")
        item = {"lat": h["lat"], "lng": h["lng"]}
        places.append({
            "id": "osm-" + h["osm"], "name": t.get("name") or "Hospital", "category": "health", "subcategory": sub,
            "chapter": nearest_chapter(item), "locality": locality, "area": None, "top": False, "price": None,
            "lat": round(h["lat"], 6), "lng": round(h["lng"], 6), "geo": {"source": "osm", "confidence": "high"},
            "mentions": [], "kind": "point", "source": "osm", "recs": [], "summary": " ".join(bits),
            "health": {k: v for k, v in {"emergency": emergency, "operator": t.get("operator"),
                       "phone": t.get("phone") or t.get("contact:phone"), "website": t.get("website") or t.get("contact:website"),
                       "hours": t.get("opening_hours"), "beds": t.get("beds")}.items() if v not in (None, "")},
        })
    print(f"{len(kept)} hospitals from OpenStreetMap ({len(hosp) - len(kept)} duplicates dropped)")

# places sharing exact coordinates (usually approximate geocodes): fan them out ~20 m
by_pos = {}
for p in places:
    by_pos.setdefault((p["lat"], p["lng"]), []).append(p)
for group in by_pos.values():
    for i, p in enumerate(group[1:], 1):
        a = i * 2.4
        p["lat"] = round(p["lat"] + 0.00018 * math.sin(a), 6)
        p["lng"] = round(p["lng"] + 0.00022 * math.cos(a), 6)

# outlines from OpenStreetMap (cached) for places with an osm id
sys.path.insert(0, str(ROOT / "tools"))
from geometry import fetch_shapes
shapes = fetch_shapes([p["osm"] for p in places if p.get("osm")])
for p in places:
    osm = p.pop("osm", None)
    if osm and shapes.get(osm) and not p.get("shape"):
        p["shape"] = shapes[osm]

# Google Places data (cached by tools/google_places.py): rating, link, better location
gfile = PRIV / "google.json"
google = json.loads(gfile.read_text()) if gfile.exists() else {}
for p in places:
    g = google.get(p["id"])
    if not g or not g.get("match"):
        continue
    p["google"] = {k: g.get(k) for k in ("id", "rating", "count", "uri")}
    if p["kind"] == "point" and p["geo"].get("confidence") != "high" and g.get("lat"):
        p["lat"], p["lng"] = round(g["lat"], 6), round(g["lng"], 6)
        p["geo"] = {"source": "google", "confidence": "high"}

# drop sections nothing points to, except the chapter's own ones (readable as a guide)
used = {m["section"] for p in places for m in p["mentions"]}
sections = [s for s in sections if not s["chapter"].startswith("gen-") or s["id"] in used]

guide = {
    "meta": {"title": "Lonely Planet South Africa, Lesotho & eSwatini", "built": datetime.date.today().isoformat(),
             "chapters": [{"id": c, "title": CHAPTER_META[c]["title"], "country": CHAPTER_META[c]["country"]} for c in CHAPTERS]},
    "sections": sections,
    "places": places,
}
(PRIV / "guide.json").write_text(json.dumps(guide, ensure_ascii=False, separators=(",", ":")))
from collections import Counter
print(len(places), "places,", len(sections), "sections,", sum(len(p["mentions"]) for p in places), "mentions")
print(Counter(p["category"] for p in places))
print("no mentions:", sum(not p["mentions"] for p in places), " multi-mention:", sum(len(p["mentions"]) > 1 for p in places))
print("low-confidence geo:", sum(p["geo"].get("confidence") == "low" for p in places))
print("kinds:", Counter(p["kind"] for p in places), " shapes:", sum(bool(p.get("shape")) for p in places),
      " with recs:", sum(bool(p["recs"]) for p in places), " google:", sum(bool(p.get("google")) for p in places))
