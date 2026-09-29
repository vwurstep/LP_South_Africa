"""Stamp a new app version: writes version.json and the service-worker CACHE name.

Run before committing any change to app files or data:  python3 tools/release.py
The app compares its loaded version with version.json on the server and shows an
"update available" banner; the new CACHE name makes the service worker refresh its files.
"""
import datetime, json, re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
v = datetime.datetime.now().strftime("%Y-%m-%d.%H%M")
(ROOT / "version.json").write_text(json.dumps({"version": v}) + "\n")
sw = ROOT / "sw.js"
sw.write_text(re.sub(r"var CACHE = '[^']*';", f"var CACHE = 'lpsa-{v}';", sw.read_text()))
print("version", v)
