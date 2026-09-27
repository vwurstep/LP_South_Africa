"""Extract a Lonely Planet ebook chapter into sections + place candidates.

Usage: python3 tools/extract_chapter.py <chapter.xhtml> <chapter-id> <out-dir>

Writes to <out-dir>:
  sections.json    readable text blocks (cleaned HTML), in book order
  candidates.json  every place mention found in the markup (poi spans, stays,
                   cafe/eat lists, map keys), with the section it sits in

Deterministic: no geocoding, no classification. That is done afterwards
(by subagents) and merged by tools/build_data.py.
"""
import json, re, sys
from pathlib import Path
from bs4 import BeautifulSoup, NavigableString, Tag

src, chapter_id, out_dir = sys.argv[1], sys.argv[2], Path(sys.argv[3])
soup = BeautifulSoup(Path(src).read_text(encoding="utf-8"), "html.parser")
root = soup.body

KEEP_TAGS = {"p", "b", "i", "em", "strong", "span", "a", "br", "ul", "li", "h3", "h4", "div"}


def text(el):
    return re.sub(r"\s+", " ", el.get_text(" ", strip=True)).replace(" :", ":").strip()


def clean_html(el):
    """Reduce an element to simple HTML: text, bold/italic, paragraphs, internal refs."""
    if isinstance(el, NavigableString):
        return str(el).replace("&", "&amp;").replace("<", "&lt;")
    if not isinstance(el, Tag) or el.name in ("img", "script", "style"):
        return ""
    inner = "".join(clean_html(c) for c in el.children)
    cls = " ".join(el.get("class", []))
    if el.name == "a":
        href = el.get("href", "")
        if href.startswith("http"):
            return f'<a href="{href}" target="_blank" rel="noopener">{inner}</a>'
        m = re.search(r"#(poiss-\d+|ref-\d+)", href)
        return f'<a data-ref="{m.group(1)}">{inner}</a>' if m and inner.strip() else inner
    if el.name == "span":
        if "poi" in el.get("class", []) and el.get("id"):
            return f'<span class="poi" id="{el["id"]}">{inner}</span>'
        if "price-range" in cls or "green" in cls:
            return f'<span class="price">{inner}</span>'
        return inner
    if el.name in ("b", "strong"):
        return f"<b>{inner}</b>"
    if el.name in ("i", "em"):
        return f"<i>{inner}</i>"
    if el.name in ("p", "li", "h3", "h4", "ul"):
        if not inner.strip():
            return ""
        tag = el.name
        idattr = f' id="{el["id"]}"' if el.get("id") else ""
        return f"<{tag}{idattr}>{inner}</{tag}>"
    return inner


# ---- walk the chapter in order --------------------------------------------
sections, candidates = [], []
state = {"page": None, "area": None, "h2": None}
cur = None


def new_section(title, level, anchor):
    global cur
    cur = {
        "id": f"{chapter_id}-s{len(sections) + 1:03d}",
        "chapter": chapter_id,
        "area": state["area"],
        "title": title,
        "parent": state["h2"] if level > 2 else None,
        "level": level,
        "page": state["page"],
        "anchor": anchor,
        "html": "",
    }
    sections.append(cur)


def add_candidate(kind, name, anchor, el, **extra):
    candidates.append({
        "kind": kind, "name": name.strip(" :"), "anchor": anchor,
        "section": cur["id"] if cur else None, "area": state["area"],
        "page": state["page"], "context": text(el)[:600], **extra,
    })


AREA_H2 = set()  # filled from the chapter mini-TOC (h4 links to area h2s)
for h4 in root.select(".minitoc h4 a"):
    AREA_H2.add(h4["href"].lstrip("#"))

h1 = root.find(["h1", "h2"])
new_section(text(h1) if h1 else chapter_id, 1, h1.get("id") if h1 else None)
map_cat = None
for el in root.descendants:
    if not isinstance(el, Tag):
        continue
    if el.name == "a" and re.match(r"page_\d+", el.get("id", "")):
        state["page"] = int(el["id"].split("_")[1])
        continue
    cls = el.get("class", [])
    # "Don't Miss" box on top-sight pages: one compact line instead of loose lines
    if el.find_parent(class_=["dont-miss", "dont-missb"]):
        continue
    if el.name == "div" and "dont-miss" in cls:
        items = [text(x) for x in el.find_all("p")]
        if items:
            cur["html"] += "<p><b>Don’t miss:</b> " + " · ".join(items) + "</p>"
        continue
    if el.name == "div" and "dont-missb" in cls:
        continue
    if el.name == "p" and "poi-head-2" in cls:
        cur["html"] += f"<h4>{text(el)}</h4>"
        continue
    # headings open new sections
    if el.name == "h2":
        t = text(el).replace("TOP SIGHT", "").strip()
        if el.get("id") in AREA_H2:
            state["area"] = t
        if el.find_parent(class_="love-to-stay") or t == "Places We Love to Stay":
            state["area"] = None
        state["h2"] = t
        new_section(t, 2, el.get("id"))
        continue
    if el.name in ("h3", "h4") or (el.name == "p" and "poi-line" in cls):
        if el.find_parent(class_="minitoc"):
            continue
        t = text(el)
        if el.find_parent(class_="love-to-stay") and el.name == "h3":
            state["area"] = t  # stays are grouped by area under h3
        level = {"h3": 3, "h4": 4}.get(el.name, 3)
        new_section(t, level, el.get("id"))
        continue
    # map keys: category headers + numbered names (tell us sight/eat/drink/...)
    if el.name == "p" and "map-key-head" in cls:
        map_cat = text(el)
        continue
    if el.name == "div" and "map-keys-poi" in cls:
        num = el.find(class_="num")
        name = text(el)[len(text(num)):].strip() if num else text(el)
        candidates.append({"kind": "mapkey", "name": name, "mapCategory": map_cat,
                           "mapNumber": text(num) if num else None, "area": state["area"],
                           "page": state["page"], "section": cur["id"]})
        continue
    if el.name in ("p", "li") and not el.find_parent(["p", "li"]):
        if el.find_parent(class_=["map-keys", "minitoc"]):
            continue
        cur["html"] += clean_html(el)
        if "wh-stay" in cls:
            price = el.find(class_="price-range")
            add_candidate("stay", text(el.find("b")), el.get("id"), el,
                          price=text(price) if price else None)
        for poi in el.select("span.poi"):
            add_candidate("poi", text(poi), poi.get("id"), el)
        for a in el.find_all("a", href=re.compile(r"#poiss-\d+")):
            add_candidate("poi-ref", text(a), a["href"].split("#")[1], el)
        if "poi-body" in cls and not el.select("span.poi") and not el.find("a", href=re.compile("#poiss")):
            add_candidate("listed", text(el.find("b")) if el.find("b") else text(el)[:60], None, el)

sections = [s for s in sections if s["html"].strip()]
out_dir.mkdir(parents=True, exist_ok=True)
(out_dir / "sections.json").write_text(json.dumps(sections, ensure_ascii=False, indent=1))
(out_dir / "candidates.json").write_text(json.dumps(candidates, ensure_ascii=False, indent=1))
print(f"{len(sections)} sections, {len(candidates)} candidates")
from collections import Counter
print(Counter(c["kind"] for c in candidates))
print(Counter(c["area"] for c in candidates if c["kind"] != "mapkey"))
