#!/usr/bin/env python3
"""Children's display mannequins at four ages, generated fresh (not edited
from the adult mannequin, which leaves adult proportions)."""
import sys, pathlib, subprocess
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import run

OUT = run.OUT / "bases"; OUT.mkdir(parents=True, exist_ok=True)
AGES = {2: "a 2-year-old toddler: big head, short chubby arms and legs, round tummy",
        6: "a 6-year-old child: slim, short limbs, no waist definition",
        10: "a 10-year-old child: slender, straight up-and-down body, longer legs",
        14: "a 14-year-old young teen: lanky, narrow shoulders, straight boyish figure"}
def make(item):
    age, body = item
    dest = OUT / f"child-raw-{age}.jpg"
    prompt = (f"Full-body e-commerce product photo of a matte white faceless children's clothing display mannequin "
              f"with the body proportions of {body}. Completely flat chest, no bust, childlike body. Wearing a plain "
              "white t-shirt and light grey leggings, standing straight facing the camera, arms relaxed at its sides, "
              "on a small round white base. Plain light grey seamless studio background, soft even light, the whole "
              "mannequin visible head to base, centered. Photorealistic.")
    r = run.call("fal-ai/flux-pro/v1.1", {"prompt": prompt, "image_size": "portrait_4_3", "output_format": "jpeg", "safety_tolerance": "2"})
    run.save(r["images"][0]["url"], dest)
    print(age, flush=True)
with ThreadPoolExecutor(4) as pool:
    list(pool.map(make, AGES.items()))
