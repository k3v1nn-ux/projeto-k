#!/usr/bin/env python3
"""Downloads the public-domain images (yuhonas/free-exercise-db) used by the program
into img/ex/ and shrinks them with macOS `sips`. Run: python3 tools/fetch_media.py"""
import os
import subprocess
import sys
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import generate_data as g  # noqa: E402

BASE = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/"
OUT = os.path.join(g.ROOT, "img", "ex")
os.makedirs(OUT, exist_ok=True)

jobs = [(row[0], row[4]) for row in g.EXERCISES if row[4]]
jobs += [(f"cardio-{i}", c["media"]) for i, c in enumerate(g.CARDIO_TYPES)]
for local_id, media in jobs:
    for frame in (0, 1):
        dest = os.path.join(OUT, f"{local_id}-{frame}.jpg")
        if os.path.exists(dest):
            continue
        urllib.request.urlretrieve(f"{BASE}{media}/{frame}.jpg", dest)
        subprocess.run(["sips", "-Z", "360", "-s", "formatOptions", "60", dest], check=True, capture_output=True)
print(f"{len(jobs) * 2} images ready in img/ex")
