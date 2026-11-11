#!/usr/bin/env python3
"""Make the extra photo mannequins from the bundled one, with an image-editing
model: four body shapes, a man, and children of four ages (raw, cut out and
placed on the studio canvas by place_child.swift)."""
import sys, pathlib, subprocess
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import run

ROOT = pathlib.Path(__file__).resolve().parents[2]
RES = ROOT / "DigiCloset" / "Resources"
OUT = run.OUT / "bases"; OUT.mkdir(parents=True, exist_ok=True)
MODEL = "fal-ai/nano-banana/edit"
KEEP = ("Keep everything else exactly the same: the same matte white faceless mannequin style, white tank top and "
        "light grey leggings, the same straight standing pose with arms relaxed, the same round base, the same camera, "
        "framing, plain grey studio background and lighting. Photorealistic product photo.")
SHAPE = ("Reshape the female mannequin in the image into a clearly {} body shape, exaggerated enough to be obvious "
         "at a glance like a plus-size or specialist display mannequin: {}. Same height. ")
JOBS = {
    "mannequin-hourglass": SHAPE.format("hourglass", "full bust and full rounded hips of equal width with a very small, sharply defined waist"),
    "mannequin-pear": SHAPE.format("pear", "hips and thighs much wider than the narrow shoulders, rounded full hips, small bust"),
    "mannequin-apple": SHAPE.format("round (apple)", "a visibly round, full tummy and wide waist with slim legs and narrow hips, curvy plus-size torso"),
    "mannequin-invertedTriangle": SHAPE.format("inverted triangle (athletic)", "very broad, square shoulders and wide chest tapering to narrow hips and slim legs"),
    "mannequin-man": "Change the female mannequin into a male mannequin with a typical adult male build, broader shoulders and flat chest, wearing a plain white t-shirt and light grey trousers. ",
}
def make(item):
    name, ask = item
    dest = OUT / f"{name}.jpg"
    if dest.exists() and name not in sys.argv[1:]:
        return
    r = run.call(MODEL, {"prompt": ask + KEEP, "image_urls": [run.data_uri(RES / "tryon-mannequin.jpg")],
                         "num_images": 1, "output_format": "jpeg", "aspect_ratio": "2:3", "sync_mode": True})
    run.save(r["images"][0]["url"], dest)
    subprocess.run(["sips", "-z", "1536", "1024", "-s", "formatOptions", "85", str(dest)], capture_output=True)
    print(name, flush=True)

with ThreadPoolExecutor(6) as pool:
    list(pool.map(make, JOBS.items()))
print("done")
