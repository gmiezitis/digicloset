#!/usr/bin/env python3
"""Make photo-real mannequin base images and test Kling on them."""
import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import run

OUT = run.OUT / "mannequin"
PROMPTS = {
    "woman": ("Full-body studio product photo of a female fashion display mannequin, matte warm white finish, "
              "smooth faceless abstract head, realistic female proportions, standing straight facing camera, "
              "arms relaxed slightly away from body, wearing a plain fitted white tank top and fitted light grey leggings, "
              "standing on a small round base, soft even studio lighting, plain light warm grey seamless background, "
              "entire figure visible head to feet, sharp focus, high-end fashion e-commerce photography"),
}

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for name, prompt in PROMPTS.items():
        for seed in (11, 23):
            base = OUT / f"{name}-{seed}.jpg"
            if not base.exists():
                print(f"mannequin {name} {seed}…")
                r = run.call(run.MODEL_GEN, {"prompt": prompt, "aspect_ratio": "2:3", "raw": True,
                                             "output_format": "jpeg", "seed": seed})
                run.save(run.first_url(r), base)
            for g in ("jeans", "knit-sweater"):
                dest = OUT / f"{name}-{seed}-{g}.jpg"
                if not dest.exists():
                    print(f"  kling {g}…", end=" ", flush=True)
                    try:
                        run.save(run.try_on("kling", base, run.OUT / f"garment-{g}.jpg", "auto"), dest)
                        print("ok")
                    except RuntimeError as e:
                        print(f"failed: {e}")

main()
