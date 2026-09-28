"""Extract every chapter in tools/chapters.json into data/private/<id>/.

Refuses to overwrite a chapter whose candidate list would change (the geocoding
batches refer to candidates by index), unless --force.
"""
import json, subprocess, sys, tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
force = "--force" in sys.argv
for ch in json.loads((ROOT / "tools/chapters.json").read_text()):
    out = ROOT / "data/private" / ch["id"]
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run([sys.executable, str(ROOT / "tools/extract_chapter.py"), str(ROOT / "book/EPUB" / ch["file"]), ch["id"], tmp],
                       check=True, capture_output=True)
        new = json.loads((Path(tmp) / "candidates.json").read_text())
        old_f = out / "candidates.json"
        if old_f.exists() and not force:
            old = json.loads(old_f.read_text())
            if [(c["kind"], c["name"]) for c in old] != [(c["kind"], c["name"]) for c in new]:
                print(f"{ch['id']}: candidates changed — NOT overwritten (use --force and redo its batches)")
                continue
        out.mkdir(parents=True, exist_ok=True)
        for f in ("sections.json", "candidates.json"):
            (out / f).write_text((Path(tmp) / f).read_text())
        print(f"{ch['id']}: {len(new)} candidates")
