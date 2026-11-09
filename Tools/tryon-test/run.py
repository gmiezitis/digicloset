#!/usr/bin/env python3
"""Try-on test for DigiCloset.

Makes one photo-real model and five product photos, puts each garment on the
model with Kling (falls back to FASHN if Kling is unavailable), and writes a
side-by-side sheet to out/index.html.

    python3 Tools/tryon-test/run.py            # Kling, about $0.50 total
    python3 Tools/tryon-test/run.py --compare  # Kling + FASHN, about $0.90

Your own photos: put model.jpg and/or garment JPG/PNGs in Tools/tryon-test/in/
and they are used instead of generated ones.
"""
import base64, json, os, pathlib, sys, time, urllib.request, urllib.error

HERE = pathlib.Path(__file__).resolve().parent
OUT, IN = HERE / "out", HERE / "in"

KLING = "fal-ai/kling/v1-5/kolors-virtual-try-on"
FASHN = "fal-ai/fashn/tryon/v1.6"
MODEL_GEN = "fal-ai/flux-pro/v1.1-ultra"
GARMENT_GEN = "fal-ai/flux/dev"

MODEL_PROMPT = (
    "Full-body studio fashion photo of a woman in her late 20s standing straight, "
    "arms relaxed at her sides, facing camera, wearing a plain fitted white tank top "
    "and fitted light grey leggings, barefoot, neutral expression, soft even studio "
    "lighting, plain light grey seamless background, entire body visible head to toe, "
    "sharp focus, natural skin texture, 85mm lens"
)
GARMENTS = [
    ("linen-shirt", "tops", "an oatmeal beige linen button-up shirt with long sleeves"),
    ("knit-sweater", "tops", "a cream cable-knit crew neck wool sweater"),
    ("jeans", "bottoms", "straight leg mid-blue denim jeans"),
    ("midi-skirt", "bottoms", "a mint green satin slip midi skirt"),
    ("slip-dress", "one-pieces", "a black silk slip dress with thin straps, midi length"),
]


def key():
    k = os.environ.get("FAL_KEY", "")
    env = HERE / ".env"
    if not k and env.exists():
        for line in env.read_text().splitlines():
            if line.startswith("FAL_KEY="):
                k = line.split("=", 1)[1].strip().strip('"')
    if not k:
        sys.exit("No key yet. Paste your fal.ai key into Tools/tryon-test/.env (FAL_KEY=...).")
    return k


def call(endpoint, payload, timeout=300):
    req = urllib.request.Request(
        f"https://fal.run/{endpoint}",
        data=json.dumps(payload).encode(),
        headers={"Authorization": f"Key {key()}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"{endpoint}: HTTP {e.code} {e.read().decode()[:300]}")


def save(url, path):
    if url.startswith("data:"):
        path.write_bytes(base64.b64decode(url.split(",", 1)[1]))
    else:
        urllib.request.urlretrieve(url, path)
    return path


def data_uri(path):
    mime = "image/png" if path.suffix.lower() == ".png" else "image/jpeg"
    return f"data:{mime};base64,{base64.b64encode(path.read_bytes()).decode()}"


def first_url(result):
    if "image" in result:
        return result["image"]["url"]
    return result["images"][0]["url"]


def model_photo():
    mine = next((p for p in IN.glob("model.*")), None) if IN.exists() else None
    if mine:
        return mine
    path = OUT / "model.jpg"
    if not path.exists():
        print("Making model photo…")
        r = call(MODEL_GEN, {"prompt": MODEL_PROMPT, "aspect_ratio": "2:3", "raw": True, "output_format": "jpeg"})
        save(first_url(r), path)
    return path


def garment_photos():
    if IN.exists():
        mine = [p for p in sorted(IN.iterdir()) if p.suffix.lower() in (".jpg", ".jpeg", ".png") and p.stem != "model"]
        if mine:
            return [(p.stem, "auto", p) for p in mine]
    result = []
    for name, cat, desc in GARMENTS:
        path = OUT / f"garment-{name}.jpg"
        if not path.exists():
            print(f"Making product photo: {name}…")
            prompt = (f"Professional e-commerce product photo of {desc}, ghost mannequin style, "
                      "front view, centered, pure white background, soft studio light, "
                      "high detail fabric texture, no person, no hanger")
            r = call(GARMENT_GEN, {"prompt": prompt, "image_size": "portrait_4_3", "num_images": 1})
            save(first_url(r), path)
        result.append((name, cat, path))
    return result


def try_on(provider, model, garment, category):
    if provider == "kling":
        r = call(KLING, {"human_image_url": data_uri(model), "garment_image_url": data_uri(garment)})
    else:
        r = call(FASHN, {"model_image": data_uri(model), "garment_image": data_uri(garment),
                         "category": category, "mode": "quality", "garment_photo_type": "flat-lay",
                         "output_format": "jpeg"})
    return first_url(r)


def main():
    OUT.mkdir(exist_ok=True)
    providers = ["kling", "fashn"] if "--compare" in sys.argv else ["kling"]
    model = model_photo()
    rows = []
    for name, cat, garment in garment_photos():
        row = {"name": name, "garment": garment.name if garment.parent == OUT else f"../in/{garment.name}"}
        for p in providers:
            dest = OUT / f"{p}-{name}.jpg"
            if not dest.exists():
                t = time.time()
                try:
                    print(f"{p}: {name}…", end=" ", flush=True)
                    save(try_on(p, model, garment, cat), dest)
                    print(f"{time.time() - t:.0f}s")
                except RuntimeError as e:
                    print(f"failed\n  {e}")
                    if p == "kling" and "fashn" not in providers:
                        print("  Kling unavailable, using FASHN instead.")
                        providers.append("fashn")
                    continue
            row[p] = dest.name
        rows.append(row)

    model_src = model.name if model.parent == OUT else f"../in/{model.name}"
    cols = ["garment"] + providers
    head = "".join(f"<th>{c.title()}</th>" for c in cols)
    body = "".join(
        "<tr>" + "".join(f"<td>{f'<img src={chr(34)}{r[c]}{chr(34)}>' if r.get(c) else '—'}</td>" for c in cols) + "</tr>"
        for r in rows)
    (OUT / "index.html").write_text(f"""<!doctype html><meta charset=utf-8><title>Try-on test</title>
<style>body{{font:15px -apple-system,sans-serif;background:#f4f1ec;margin:24px}}
table{{border-collapse:collapse}}td,th{{padding:8px;vertical-align:top}}
img{{width:260px;border-radius:12px;background:#fff}}</style>
<h2>Model</h2><img src="{model_src}"><h2>Results</h2><table><tr>{head}</tr>{body}</table>""")
    print(f"\nDone. Open {OUT / 'index.html'}")


if __name__ == "__main__":
    main()
