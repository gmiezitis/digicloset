#!/usr/bin/env python3
"""Pre-dress the example clothes (Kling) and accessories (nano-banana) on each
body-shape mannequin. Writes Resources/tryon-<slug>--mannequin-<shape>.jpg."""
import sys, pathlib, subprocess
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import run
import edit_presets as ep  # accessory prompts

ROOT = pathlib.Path(__file__).resolve().parents[2]
RES = ROOT / "DigiCloset" / "Resources"
SHAPES = ["hourglass", "pear", "apple", "invertedTriangle"]
CLOTHES = ["linen-shirt", "camel-trousers", "rose-slip-dress", "wool-coat", "sage-knit", "straight-jeans",
           "ivory-midi-skirt", "blush-blouse", "rose-midi-skirt", "denim-jacket", "wide-leg-trousers"]
ACCESSORIES = [(s, t, w) for s, b, t, w in ep.JOBS if b == "mannequin"]

def job(item):
    shape, slug, kind = item
    base = RES / f"tryon-mannequin-{shape}.jpg"
    dest = RES / f"tryon-{slug}--mannequin-{shape}.jpg"
    if dest.exists():
        return
    try:
        if kind == "kling":
            url = run.try_on("kling", base, run.OUT / "examples" / f"{slug}.jpg", "auto")
        else:
            template, what = kind
            piece = run.OUT / "edit" / f"in-{slug}.jpg"
            r = run.call(ep.MODEL, {"prompt": template.format(animal="", what=what) + ep.KEEP,
                                    "image_urls": [run.data_uri(base), run.data_uri(piece)],
                                    "num_images": 1, "output_format": "jpeg", "aspect_ratio": "2:3", "sync_mode": True})
            url = r["images"][0]["url"]
        run.save(url, dest)
        subprocess.run(["sips", "-Z", "1152", "-s", "formatOptions", "68", str(dest)], capture_output=True)
        print("ok", slug, shape, flush=True)
    except Exception as e:
        print("FAILED", slug, shape, str(e)[:120], flush=True)

items = [(s, c, "kling") for s in SHAPES for c in CLOTHES] + [(s, a, (t, w)) for s in SHAPES for a, t, w in ACCESSORIES]
with ThreadPoolExecutor(8) as pool:
    list(pool.map(job, items))
print("done")
