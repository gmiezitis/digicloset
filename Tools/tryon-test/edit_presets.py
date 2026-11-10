#!/usr/bin/env python3
"""Pre-dress example pet pieces and accessories with the image-editing model,
one piece per image, so the app can combine them instantly.
Writes DigiCloset/Resources/tryon-<slug>.jpg (pets: on tryon-dog/cat.jpg;
accessories: on the bare tryon-mannequin.jpg)."""
import sys, pathlib, subprocess
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import run

ROOT = pathlib.Path(__file__).resolve().parents[2]
RES = ROOT / "DigiCloset" / "Resources"
MODEL = "fal-ai/nano-banana/edit"
KEEP = ("Keep everything else exactly the same: the same pose, position and size in the frame, the same camera, "
        "crop, plain grey studio background, floor shadow and lighting. Photorealistic.")
PET = "Dress the white {animal} statue in the first image in the {what} from the second image, fitted naturally to its body. "
ACC = {
    "hat": "Put the {what} from the second image on the mannequin's head in the first image, worn properly: the crown covers the top of the head and the brim sits level, at a realistic size. ",
    "shoes": "Put the {what} from the second image on the mannequin's feet in the first image, worn properly at a realistic size. ",
    "bag": "Make the mannequin in the first image carry the {what} from the second image, hanging from its hand by the handles at its side, at a realistic size. ",
}
JOBS = [
    ("cable-knit", "dog", PET, "knitted dog sweater"), ("rain-coat", "dog", PET, "dog rain coat"),
    ("rose-bandana", "dog", PET, "bandana, tied around its neck"), ("cream-collar", "dog", PET, "collar, around its neck"),
    ("sage-sweater", "cat", PET, "knitted cat sweater"), ("blush-bandana", "cat", PET, "bandana, tied around its neck"),
    ("velvet-collar", "cat", PET, "collar with a bell, around its neck"),
    ("straw-hat", "mannequin", ACC["hat"], "straw hat"), ("white-sneakers", "mannequin", ACC["shoes"], "white sneakers"),
    ("leather-loafers", "mannequin", ACC["shoes"], "leather loafers"), ("ballet-flats", "mannequin", ACC["shoes"], "ballet flats"),
    ("woven-tote", "mannequin", ACC["bag"], "woven leather tote bag"),
]

for slug, base, template, what in JOBS:
    dest = RES / f"tryon-{slug}.jpg"
    if dest.exists() and slug not in sys.argv[1:]:
        continue
    piece = run.OUT / "edit" / f"in-{slug}.jpg"
    subprocess.run(["sips", "-s", "format", "jpeg", "-Z", "768", str(RES / f"example-{slug}.heic"), "--out", str(piece)], capture_output=True)
    prompt = template.format(animal=base, what=what) + KEEP
    print(f"{slug}…", flush=True)
    r = run.call(MODEL, {"prompt": prompt, "image_urls": [run.data_uri(RES / f"tryon-{base}.jpg"), run.data_uri(piece)],
                         "num_images": 1, "output_format": "jpeg", "aspect_ratio": "2:3", "sync_mode": True})
    run.save(r["images"][0]["url"], dest)
    subprocess.run(["sips", "-Z", "1152", "-s", "formatOptions", "70", str(dest)], capture_output=True)
print("done")
