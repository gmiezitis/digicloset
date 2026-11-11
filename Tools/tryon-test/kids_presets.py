#!/usr/bin/env python3
"""Pre-dress the kids' example pieces on each child mannequin.
Everything goes through nano-banana.
Writes Resources/tryon-<slug>--child-<age>.jpg."""
import sys, pathlib, subprocess
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import run
import edit_presets as ep

ROOT = pathlib.Path(__file__).resolve().parents[2]
RES = ROOT / "DigiCloset" / "Resources"
AGES = ["child-2", "child-6", "child-10", "child-14"]
# Kling turned jeans into shorts and the mannequin into a person, so clothes use the editing model too.
DRESS = ("Dress the white child mannequin in the first image in the {what} from the second image, at a true children's "
         "size, fitted naturally to its body. The mannequin stays a blank white faceless mannequin with no face, hair or skin. ")
CLOTHES = [("striped-tee", DRESS, "striped t-shirt, replacing its white t-shirt"),
           ("kids-jeans", DRESS, "full-length jeans reaching down to the ankles, replacing its grey leggings, with its white t-shirt tucked out over them"),
           ("pinafore-dress", DRESS, "corduroy pinafore dress, worn over its white t-shirt, knee length"),
           ("yellow-raincoat", DRESS, "yellow rain jacket, worn open-hood down, over its white t-shirt")]
ACCESSORIES = [("kids-sneakers", ep.ACC["shoes"], "children's sneakers"),
               ("knit-beanie", ep.ACC["hat"], "knitted beanie with a pom-pom")]

def job(item):
    age, slug, kind = item
    base = RES / f"tryon-{age}.jpg"
    dest = RES / f"tryon-{slug}--{age}.jpg"
    if dest.exists() and slug not in sys.argv[1:]:
        return
    try:
        if kind == "kling":
            url = run.try_on("kling", base, run.OUT / "examples" / f"{slug}.jpg", "auto")
        else:
            template, what = kind
            piece = run.OUT / "edit" / f"in-{slug}.jpg"
            subprocess.run(["sips", "-s", "format", "jpeg", "-Z", "768", str(RES / f"example-{slug}.heic"), "--out", str(piece)], capture_output=True)
            r = run.call(ep.MODEL, {"prompt": template.format(what=what) + ep.KEEP,
                                    "image_urls": [run.data_uri(base), run.data_uri(piece)],
                                    "num_images": 1, "output_format": "jpeg", "aspect_ratio": "2:3", "sync_mode": True})
            url = r["images"][0]["url"]
        run.save(url, dest)
        subprocess.run(["sips", "-Z", "1152", "-s", "formatOptions", "68", str(dest)], capture_output=True)
        print("ok", slug, age, flush=True)
    except Exception as e:
        print("FAILED", slug, age, str(e)[:160], flush=True)

if __name__ == "__main__":
    (run.OUT / "edit").mkdir(parents=True, exist_ok=True)
    items = [(a, s, (t, w)) for a in AGES for s, t, w in CLOTHES + ACCESSORIES]
    with ThreadPoolExecutor(8) as pool:
        list(pool.map(job, items))
    print("done")
