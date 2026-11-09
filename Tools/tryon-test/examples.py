#!/usr/bin/env python3
"""Generate realistic product photos for DigiCloset's example closet.

    python3 Tools/tryon-test/examples.py            # missing ones only
    python3 Tools/tryon-test/examples.py linen-shirt # redo one

Writes out/examples/<slug>.jpg; cut out with Tools/tryon-test/cutout.swift.
"""
import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import run

OUT = run.OUT / "examples"
FLAT = ("Professional e-commerce flat lay product photo of {}, laid perfectly flat and neatly arranged, "
        "shot from directly above, centered with generous margin, isolated on a pure white background, "
        "soft even studio lighting with a faint natural shadow, crisp realistic fabric texture, "
        "no hanger, no mannequin, no person, no props, no text")
OBJ = ("Professional e-commerce product photo of {}, three-quarter view, centered with generous margin, "
       "isolated on a pure white background, soft studio lighting, faint natural shadow, "
       "crisp realistic material texture, no person, no props, no text")

PIECES = {
    "linen-shirt": (FLAT, "an oatmeal cream linen button-up shirt with long sleeves and a classic collar"),
    "camel-trousers": (FLAT, "camel brown wide-leg tailored wool trousers"),
    "white-sneakers": (OBJ, "a pair of minimal white leather low-top sneakers with white laces"),
    "straw-hat": (OBJ, "a natural woven straw boater hat with a black ribbon band"),
    "rose-slip-dress": (FLAT, "a dusty rose pink silk satin slip dress with thin straps, midi length"),
    "wool-coat": (FLAT, "a black long tailored wool coat with notch lapels and buttons, sleeves laid alongside"),
    "sage-knit": (FLAT, "a sage green soft ribbed knit crew neck sweater"),
    "straight-jeans": (FLAT, "black washed straight-leg denim jeans"),
    "leather-loafers": (OBJ, "a pair of dark brown polished leather penny loafers"),
    "ivory-midi-skirt": (FLAT, "an ivory satin bias-cut midi skirt"),
    "woven-tote": (OBJ, "a tan woven leather tote bag with two handles"),
    "blush-blouse": (FLAT, "a blush pink silky blouse with long sleeves and a soft collar"),
    "rose-midi-skirt": (FLAT, "a rose pink floaty pleated midi skirt"),
    "ballet-flats": (OBJ, "a pair of pale blush pink leather ballet flats"),
    "denim-jacket": (FLAT, "a classic mid-blue denim trucker jacket with buttons and chest pockets"),
    "wide-leg-trousers": (FLAT, "navy blue wide-leg high-waisted tailored trousers"),
    "cable-knit": (FLAT, "a small camel brown cable knit dog sweater"),
    "cream-collar": (OBJ, "a cream leather dog collar with a gold metal buckle and ring"),
    "rose-bandana": (FLAT, "a dusty rose pink cotton pet bandana folded into a triangle"),
    "rain-coat": (FLAT, "a small navy blue waxed cotton dog rain coat"),
    "blush-bandana": (FLAT, "a blush pink cotton pet bandana with tiny white polka dots, folded into a triangle"),
    "velvet-collar": (OBJ, "a slim black velvet cat collar with a small gold bell"),
    "sage-sweater": (FLAT, "a small sage green knitted cat sweater"),
}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    redo = set(sys.argv[1:])
    for slug, (template, desc) in PIECES.items():
        path = OUT / f"{slug}.jpg"
        if path.exists() and slug not in redo:
            continue
        print(f"{slug}…", flush=True)
        r = run.call("fal-ai/flux-pro/v1.1", {"prompt": template.format(desc), "image_size": "square_hd",
                                             "output_format": "jpeg", "safety_tolerance": "2"})
        run.save(run.first_url(r), path)
    print("done")


if __name__ == "__main__":
    main()
