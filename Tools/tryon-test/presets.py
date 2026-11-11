#!/usr/bin/env python3
"""Pre-dress the example pieces on the bundled mannequin (one Kling call each)
so they're instant in the app. Writes DigiCloset/Resources/tryon-<slug>.jpg."""
import sys, pathlib, subprocess
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import run

ROOT = pathlib.Path(__file__).resolve().parents[2]
RES = ROOT / "DigiCloset" / "Resources"
SLUGS = ["linen-shirt", "camel-trousers", "rose-slip-dress", "wool-coat", "sage-knit", "straight-jeans",
         "ivory-midi-skirt", "blush-blouse", "rose-midi-skirt", "denim-jacket", "wide-leg-trousers"]

for slug in SLUGS:
    dest = RES / f"tryon-{slug}.jpg"
    if dest.exists() and slug not in sys.argv[1:]:
        continue
    print(f"{slug}…", flush=True)
    url = run.try_on("kling", RES / "tryon-mannequin.jpg", run.OUT / "examples" / f"{slug}.jpg", "auto")
    run.save(url, dest)
    subprocess.run(["sips", "-Z", "1296", "-s", "formatOptions", "82", str(dest)], capture_output=True)
print("done")
