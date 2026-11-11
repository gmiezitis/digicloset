#!/usr/bin/env python3
"""Try an image-editing model for what Kling can't do: pets and accessories."""
import sys, pathlib, time, subprocess
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import run

ROOT = pathlib.Path(__file__).resolve().parents[2]
RES = ROOT / "DigiCloset" / "Resources"
ASSETS = ROOT / "DigiCloset" / "Assets.xcassets"
OUT = run.OUT / "edit"
OUT.mkdir(parents=True, exist_ok=True)
MODEL = sys.argv[1] if len(sys.argv) > 1 else "fal-ai/nano-banana/edit"

def jpeg(src, name):
    dest = OUT / f"in-{name}.jpg"
    subprocess.run(["sips", "-s", "format", "jpeg", "-Z", "1024", str(src), "--out", str(dest)], capture_output=True)
    return dest

def edit(name, base, piece, prompt):
    t = time.time()
    r = run.call(MODEL, {"prompt": prompt, "image_urls": [run.data_uri(base), run.data_uri(piece)],
                         "num_images": 1, "output_format": "jpeg", "sync_mode": True})
    run.save(r["images"][0]["url"], OUT / f"{name}.jpg")
    print(f"{name}: {time.time() - t:.0f}s")

dog = jpeg(next(ASSETS.glob("mannequin_dog.imageset/*.png")), "dog")
knit = jpeg(RES / "example-cable-knit.heic", "knit")
hat = jpeg(RES / "example-straw-hat.heic", "hat")
edit("dog-knit", dog, knit,
     "Dress the white dog statue from the first image in the knitted dog sweater from the second image. "
     "The sweater fits naturally over its back, chest and front legs. Keep the dog's pose, the camera, "
     "the plain background and the lighting exactly the same. Photorealistic product photo.")
edit("hat", RES / "tryon-linen-shirt.jpg", hat,
     "Put the straw hat from the second image on the mannequin's head in the first image, worn naturally "
     "and sitting snugly on the head at the right size and angle. Change nothing else: same mannequin, "
     "clothes, pose, background, framing and lighting.")
