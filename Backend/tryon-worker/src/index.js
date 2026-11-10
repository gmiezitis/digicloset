// DigiCloset try-on proxy. Keeps the fal.ai key off the phone.
//
// POST /tryon  (headers X-App-Token, optional X-Device-Id)
//   { "person": "<base64 jpeg>", "garment": "<base64 png/jpeg>", "category": "tops|bottoms|one-pieces|auto" }
// → { "image": "<url>", "provider": "kling" | "fashn", "remaining": <try-ons left today on this device> }
// → 429 { "error": "quota", "scope": "device" | "daily", "remaining": 0 } when a limit is reached
//
// POST /edit  (same headers) — pet wear and accessories, which Kling can't dress
//   { "base": "<base64 jpeg>", "piece": "<base64 jpeg>", "kind": "sweater|collar|bandana|hat|shoes|bag", "target": "dog|cat|person" }
// → { "image": "<url>", "remaining": <n> }; counts against the same limits.
// The prompt is built here from `kind`, so the app can't turn this into a
// general image generator on our fal account.

const KLING = "fal-ai/kling/v1-5/kolors-virtual-try-on";
const FASHN = "fal-ai/fashn/tryon/v1.6";
const EDIT = "fal-ai/nano-banana/edit";
const MAX_BYTES = 8 * 1024 * 1024;

const KEEP = "Keep everything else exactly the same: the same pose, position and size in the frame, the same camera, "
  + "crop, plain grey studio background, floor shadow and lighting. Photorealistic.";

// Mirrors TryOnService.editCall in the app.
function editPrompt(kind, target) {
  const animal = target === "cat" ? "cat" : "dog";
  const asks = {
    sweater: `Dress the white ${animal} statue in the first image in the garment from the second image, fitted naturally to its body. `,
    collar: `Put the collar from the second image around the neck of the white ${animal} statue in the first image. `,
    bandana: `Tie the bandana from the second image around the neck of the white ${animal} statue in the first image. `,
    hat: "Put the hat from the second image on the mannequin's head in the first image, worn properly: the crown covers the top of the head and the brim sits level, at a realistic size. ",
    shoes: "Put the shoes from the second image on the mannequin's feet in the first image, worn properly at a realistic size. ",
    bag: "Make the mannequin in the first image carry the bag from the second image, hanging from its hand by the handles at its side, at a realistic size. ",
  };
  return asks[kind] ? asks[kind] + KEEP : null;
}

// Every try-on costs about $0.07, so the worker caps spending itself rather than
// trusting the app. 200 a day across everyone is at most ~$14/day.
const DEFAULT_DAILY_LIMIT = 200;
const DEFAULT_DEVICE_DAILY_LIMIT = 10;
const COUNTER_TTL_SECONDS = 2 * 24 * 60 * 60;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method !== "POST" || !["/tryon", "/edit"].includes(url.pathname)) {
      return json({ error: "not found" }, 404);
    }
    if (!env.APP_TOKEN || request.headers.get("X-App-Token") !== env.APP_TOKEN) {
      return json({ error: "unauthorized" }, 401);
    }
    // Fail closed: without the counter store there would be no spending limit.
    if (!env.QUOTA) {
      return json({ error: "quota store not configured" }, 503);
    }
    if (Number(request.headers.get("Content-Length") || 0) > MAX_BYTES) {
      return json({ error: "image too large" }, 413);
    }

    let body;
    try { body = await request.json(); } catch { return json({ error: "bad json" }, 400); }
    if (url.pathname === "/edit") return handleEdit(request, env, body);
    const { person, garment } = body;
    const category = ["tops", "bottoms", "one-pieces"].includes(body.category) ? body.category : "auto";
    if (typeof person !== "string" || typeof garment !== "string") {
      return json({ error: "person and garment are required" }, 400);
    }

    const quota = await reserveTryOn(request, env);
    if (!quota.ok) {
      return json({ error: "quota", scope: quota.scope, remaining: 0 }, 429);
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
        return json({ image, provider, remaining: quota.remaining });
      } catch (e) {
        errors.push(`${provider}: ${e.message}`);
      }
    }
    // Nothing was produced, so give the try-on back.
    await quota.refund();
    return json({ error: "try-on failed", details: errors }, 502);
  },
};

async function handleEdit(request, env, body) {
  const { base, piece } = body;
  const prompt = editPrompt(body.kind, body.target);
  if (typeof base !== "string" || typeof piece !== "string" || !prompt) {
    return json({ error: "base, piece and a known kind are required" }, 400);
  }
  const quota = await reserveTryOn(request, env);
  if (!quota.ok) {
    return json({ error: "quota", scope: quota.scope, remaining: 0 }, 429);
  }
  try {
    const result = await fal(env, EDIT, {
      prompt,
      image_urls: [`data:image/jpeg;base64,${base}`, `data:image/jpeg;base64,${piece}`],
      num_images: 1, output_format: "jpeg", aspect_ratio: "2:3",
    });
    return json({ image: result.images[0].url, remaining: quota.remaining });
  } catch (e) {
    await quota.refund();
    return json({ error: "edit failed", details: [e.message] }, 502);
  }
}

// Counts try-ons per UTC day, for the whole app and for each device, in Workers KV.
// The slot is taken before calling fal so parallel requests can't all slip through.
// KV isn't transactional, so a burst can overshoot a limit by a few; the daily cap
// still bounds the bill.
async function reserveTryOn(request, env) {
  const dailyLimit = positiveInt(env.DAILY_LIMIT, DEFAULT_DAILY_LIMIT);
  const deviceLimit = positiveInt(env.DEVICE_DAILY_LIMIT, DEFAULT_DEVICE_DAILY_LIMIT);
  const day = new Date().toISOString().slice(0, 10);
  const appKey = `tryon:day:${day}`;
  const deviceKey = `tryon:device:${day}:${await deviceBucket(request)}`;

  const [appCount, deviceCount] = await Promise.all([count(env, appKey), count(env, deviceKey)]);
  if (appCount >= dailyLimit) return { ok: false, scope: "daily" };
  if (deviceCount >= deviceLimit) return { ok: false, scope: "device" };

  await Promise.all([put(env, appKey, appCount + 1), put(env, deviceKey, deviceCount + 1)]);
  return {
    ok: true,
    remaining: Math.max(0, deviceLimit - deviceCount - 1),
    refund: async () => {
      const [a, d] = await Promise.all([count(env, appKey), count(env, deviceKey)]);
      await Promise.all([put(env, appKey, Math.max(0, a - 1)), put(env, deviceKey, Math.max(0, d - 1))]);
    },
  };
}

// The app's device id if it sends one, otherwise the caller's IP. Hashed so no
// raw identifier or IP address is stored.
async function deviceBucket(request) {
  const header = request.headers.get("X-Device-Id") || "";
  const raw = /^[A-Za-z0-9-]{8,64}$/.test(header)
    ? `id:${header}`
    : `ip:${request.headers.get("CF-Connecting-IP") || "unknown"}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return [...new Uint8Array(digest)].slice(0, 16).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function count(env, key) {
  return Number(await env.QUOTA.get(key)) || 0;
}

function put(env, key, value) {
  return env.QUOTA.put(key, String(value), { expirationTtl: COUNTER_TTL_SECONDS });
}

function positiveInt(value, fallback) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

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
