// DigiCloset try-on proxy. Keeps the fal.ai key off the phone.
//
// POST /tryon  (header X-App-Token)
//   { "person": "<base64 jpeg>", "garment": "<base64 png/jpeg>", "category": "tops|bottoms|one-pieces|auto" }
// → { "image": "<url>", "provider": "kling" | "fashn" }

const KLING = "fal-ai/kling/v1-5/kolors-virtual-try-on";
const FASHN = "fal-ai/fashn/tryon/v1.6";
const MAX_BYTES = 8 * 1024 * 1024;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== "/tryon") {
      return json({ error: "not found" }, 404);
    }
    if (!env.APP_TOKEN || request.headers.get("X-App-Token") !== env.APP_TOKEN) {
      return json({ error: "unauthorized" }, 401);
    }
    if (Number(request.headers.get("Content-Length") || 0) > MAX_BYTES) {
      return json({ error: "image too large" }, 413);
    }

    let body;
    try { body = await request.json(); } catch { return json({ error: "bad json" }, 400); }
    const { person, garment } = body;
    const category = ["tops", "bottoms", "one-pieces"].includes(body.category) ? body.category : "auto";
    if (typeof person !== "string" || typeof garment !== "string") {
      return json({ error: "person and garment are required" }, 400);
    }
    const personURI = `data:image/jpeg;base64,${person}`;
    const garmentURI = `data:${garment.startsWith("iVBOR") ? "image/png" : "image/jpeg"};base64,${garment}`;

    // Kling first (cheapest), FASHN if Kling fails or is retired.
    const order = env.PROVIDER === "fashn" ? ["fashn", "kling"] : ["kling", "fashn"];
    const errors = [];
    for (const provider of order) {
      try {
        const image = provider === "kling"
          ? (await fal(env, KLING, { human_image_url: personURI, garment_image_url: garmentURI })).image.url
          : (await fal(env, FASHN, {
              model_image: personURI, garment_image: garmentURI, category,
              mode: "balanced", garment_photo_type: "flat-lay", output_format: "jpeg",
            })).images[0].url;
        return json({ image, provider });
      } catch (e) {
        errors.push(`${provider}: ${e.message}`);
      }
    }
    return json({ error: "try-on failed", details: errors }, 502);
  },
};

async function fal(env, endpoint, payload) {
  const res = await fetch(`https://fal.run/${endpoint}`, {
    method: "POST",
    headers: { Authorization: `Key ${env.FAL_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}
