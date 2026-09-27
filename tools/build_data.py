"""Merge subagent batches into data/private/guide.json.

Usage: python3 tools/build_data.py
Reads data/private/<chapter>/{sections,candidates}.json and batches/*.places.json
for every chapter in CHAPTERS, plus sections of the general chapters (for extra
text-match mentions). See CLAUDE.md for the schema.
"""
import json, math, re, subprocess, sys, unicodedata, hashlib, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PRIV = ROOT / "data" / "private"
EPUB = ROOT / "book" / "EPUB"
CHAPTERS = ["capetown"]
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
                mentions.append({"section": c["section"], "anchor": anchor})
            area = next((cands[i]["area"] for i in p["candidates"] if cands[i]["area"]), None)
            places.append({
                "name": p["name"].strip(), "category": p["category"], "subcategory": p.get("subcategory"),
                "area": area, "top": bool(p.get("top")), "price": p.get("price"),
                "lat": round(p["lat"], 6), "lng": round(p["lng"], 6), "geo": p.get("geo", {}),
                "mentions": mentions,
            })

# merge same-named places across batches when they are close together
merged = []
for p in places:
    twin = next((q for q in merged if norm(q["name"]) == norm(p["name"]) and dist_km(p, q) < 1.5), None)
    if twin:
        twin["mentions"] += p["mentions"]
        twin["top"] = twin["top"] or p["top"]
        twin["price"] = twin["price"] or p["price"]
    else:
        merged.append(p)
places = merged

# extra mentions: exact-name text matches in any section not already linked
for p in places:
    name = p["name"]
    if len(name) < 8 and " " not in name:
        continue  # too generic to text-match safely
    pat = re.compile(r"(?<![\w’'])" + re.escape(name) + r"(?![\w’'])")
    have = {m["section"] for m in p["mentions"]}
    for s in sections:
        if s["id"] not in have and pat.search(plain(s["html"])):
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
    p["mentions"] = ms
    p["id"] = slug(p["name"]) + "-" + hashlib.sha1(f'{p["name"]}{p["lat"]}'.encode()).hexdigest()[:4]

# places sharing exact coordinates (usually approximate geocodes): fan them out ~20 m
by_pos = {}
for p in places:
    by_pos.setdefault((p["lat"], p["lng"]), []).append(p)
for group in by_pos.values():
    for i, p in enumerate(group[1:], 1):
        a = i * 2.4
        p["lat"] = round(p["lat"] + 0.00018 * math.sin(a), 6)
        p["lng"] = round(p["lng"] + 0.00022 * math.cos(a), 6)

# drop sections nothing points to, except the chapter's own ones (readable as a guide)
used = {m["section"] for p in places for m in p["mentions"]}
sections = [s for s in sections if not s["chapter"].startswith("gen-") or s["id"] in used]

guide = {
    "meta": {"title": "Lonely Planet South Africa, Lesotho & eSwatini", "built": datetime.date.today().isoformat(),
             "chapters": CHAPTERS},
    "sections": sections,
    "places": places,
}
(PRIV / "guide.json").write_text(json.dumps(guide, ensure_ascii=False, separators=(",", ":")))
from collections import Counter
print(len(places), "places,", len(sections), "sections,", sum(len(p["mentions"]) for p in places), "mentions")
print(Counter(p["category"] for p in places))
print("no mentions:", sum(not p["mentions"] for p in places), " multi-mention:", sum(len(p["mentions"]) > 1 for p in places))
print("low-confidence geo:", sum(p["geo"].get("confidence") == "low" for p in places))
