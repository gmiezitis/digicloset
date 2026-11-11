// DigiCloset try-on proxy. Keeps the fal.ai key off the phone.
//
// POST /tryon  (headers X-App-Token, optional X-Device-Id)
//   { "person": "<base64 jpeg>", "garment": "<base64 png/jpeg>", "category": "tops|bottoms|one-pieces|auto" }
// → { "image": "<url>", "provider": "kling" | "fashn", "remaining": <try-ons left today on this device> }
// → 429 { "error": "quota", "scope": "device" | "device-month" | "budget", "remaining": 0 } when a limit is reached
// → 503 { "error": "paused" } while the kill switch is on
//
// POST /edit  (same headers) — pet wear and accessories, which Kling can't dress
//   { "base": "<base64 jpeg>", "piece": "<base64 jpeg>", "kind": "sweater|collar|bandana|hat|shoes|bag", "target": "dog|cat|person" }
// → { "image": "<url>", "remaining": <n> }; counts against the same limits.
// The prompt is built here from `kind`, so the app can't turn this into a
// general image generator on our fal account.
//
// GET /usage  (header X-Admin-Token) → today's and this month's spend against the budgets.

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

// The worker caps spending itself rather than trusting the app. It counts money,
// not requests, because the models cost different amounts. Prices are fal's list
// prices in US cents, rounded up; a try-on is charged at the dearer provider since
// FASHN may be the one that answers. Update these if fal's prices change.
const COST_CENTS = { tryon: 8, edit: 4 };

const DEFAULTS = {
  DAILY_BUDGET_USD: 15,      // whole app, per UTC day
  MONTHLY_BUDGET_USD: 150,   // whole app, per calendar month (UTC)
  DEVICE_DAILY_LIMIT: 10,    // try-ons per phone per day
  DEVICE_MONTHLY_LIMIT: 60,  // try-ons per phone per month (above Family's 50)
};
const COUNTER_TTL_SECONDS = 40 * 24 * 60 * 60; // outlives a month, then cleans itself up

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/usage") return usage(request, env);
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
    // Kill switch, no redeploy needed:  npx wrangler kv key put --binding QUOTA config:paused 1
    if (env.PAUSED === "true" || await env.QUOTA.get("config:paused")) {
      return json({ error: "paused" }, 503);
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

    const quota = await reserve(request, env, COST_CENTS.tryon);
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
  const quota = await reserve(request, env, COST_CENTS.edit);
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

// Two counters in Workers KV, each one JSON value so a request costs two reads
// and two writes (the free KV plan allows 1,000 writes a day):
//   spend          → { day, dayCents, month, monthCents } for the whole app
//   dev:<hash>     → { day, dayCount, month, monthCount } for one phone
// The slot is taken before calling fal so parallel requests can't all slip through.
// KV isn't transactional, so a burst can overshoot by a few; the budgets still bound the bill.
async function reserve(request, env, cents) {
  const limits = readLimits(env);
  const now = periods();
  const devKey = `dev:${await deviceBucket(request)}`;
  const [spend, dev] = await Promise.all([counter(env, "spend", now), counter(env, devKey, now)]);

  if (spend.dayCents + cents > limits.dayCents || spend.monthCents + cents > limits.monthCents) {
    return { ok: false, scope: "budget" };
  }
  if (dev.dayCount >= limits.deviceDay) return { ok: false, scope: "device" };
  if (dev.monthCount >= limits.deviceMonth) return { ok: false, scope: "device-month" };

  await Promise.all([
    save(env, "spend", { ...now, dayCents: spend.dayCents + cents, monthCents: spend.monthCents + cents }),
    save(env, devKey, { ...now, dayCount: dev.dayCount + 1, monthCount: dev.monthCount + 1 }),
  ]);
  return {
    ok: true,
    remaining: Math.max(0, Math.min(limits.deviceDay - dev.dayCount, limits.deviceMonth - dev.monthCount) - 1),
    // Nothing was produced, so give the money and the try-on back.
    refund: async () => {
      const [s, d] = await Promise.all([counter(env, "spend", now), counter(env, devKey, now)]);
      await Promise.all([
        save(env, "spend", { ...now, dayCents: Math.max(0, s.dayCents - cents), monthCents: Math.max(0, s.monthCents - cents) }),
        save(env, devKey, { ...now, dayCount: Math.max(0, d.dayCount - 1), monthCount: Math.max(0, d.monthCount - 1) }),
      ]);
    },
  };
}

// GET /usage for the owner: how much has been spent against the budgets.
async function usage(request, env) {
  if (!env.ADMIN_TOKEN || request.headers.get("X-Admin-Token") !== env.ADMIN_TOKEN || !env.QUOTA) {
    return json({ error: "not found" }, 404);
  }
  const limits = readLimits(env);
  const now = periods();
  const spend = await counter(env, "spend", now);
  return json({
    paused: env.PAUSED === "true" || Boolean(await env.QUOTA.get("config:paused")),
    today: { day: now.day, spentUSD: spend.dayCents / 100, budgetUSD: limits.dayCents / 100 },
    month: { month: now.month, spentUSD: spend.monthCents / 100, budgetUSD: limits.monthCents / 100 },
    deviceLimits: { perDay: limits.deviceDay, perMonth: limits.deviceMonth },
  });
}

function readLimits(env) {
  return {
    dayCents: Math.round(positiveNumber(env.DAILY_BUDGET_USD, DEFAULTS.DAILY_BUDGET_USD) * 100),
    monthCents: Math.round(positiveNumber(env.MONTHLY_BUDGET_USD, DEFAULTS.MONTHLY_BUDGET_USD) * 100),
    deviceDay: positiveInt(env.DEVICE_DAILY_LIMIT, DEFAULTS.DEVICE_DAILY_LIMIT),
    deviceMonth: positiveInt(env.DEVICE_MONTHLY_LIMIT, DEFAULTS.DEVICE_MONTHLY_LIMIT),
  };
}

function periods() {
  const iso = new Date().toISOString();
  return { day: iso.slice(0, 10), month: iso.slice(0, 7) };
}

// Reads a counter, starting the day's or month's numbers again when the period has changed.
async function counter(env, key, now) {
  let saved = {};
  try { saved = JSON.parse(await env.QUOTA.get(key)) || {}; } catch { saved = {}; }
  const sameDay = saved.day === now.day;
  const sameMonth = saved.month === now.month;
  return {
    dayCents: sameDay ? Number(saved.dayCents) || 0 : 0,
    monthCents: sameMonth ? Number(saved.monthCents) || 0 : 0,
    dayCount: sameDay ? Number(saved.dayCount) || 0 : 0,
    monthCount: sameMonth ? Number(saved.monthCount) || 0 : 0,
  };
}

function save(env, key, value) {
  return env.QUOTA.put(key, JSON.stringify(value), { expirationTtl: COUNTER_TTL_SECONDS });
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

function positiveNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
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
