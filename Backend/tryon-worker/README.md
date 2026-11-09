# Try-on backend

A tiny Cloudflare Worker that forwards try-on requests to fal.ai, so the fal key never ships in the app.
It uses Kling first (~$0.07/image) and falls back to FASHN (~$0.075) if Kling fails.

## Deploy (one time, about 5 minutes)

1. Install Node.js (nodejs.org) and create a free Cloudflare account.
2. In this folder:
   ```bash
   npx wrangler login
   npx wrangler secret put FAL_KEY      # paste your fal.ai key
   npx wrangler secret put APP_TOKEN    # any long random string, also used in the app
   npx wrangler kv namespace create QUOTA   # paste the printed id into wrangler.toml
   npx wrangler deploy
   ```
3. Copy the printed URL (like `https://digicloset-tryon.<you>.workers.dev`) and the APP_TOKEN into
   `DigiCloset/Services/TryOnConfig.swift`.

## Spending limits

The worker counts try-ons itself, so a patched app or leaked token can't run up the fal bill:

- `DAILY_LIMIT` (default 200): try-ons per UTC day for the whole app. At ~$0.07 each that caps spend at ~$14/day.
- `DEVICE_DAILY_LIMIT` (default 10): try-ons per UTC day per device. The app can send an `X-Device-Id` header; without it the caller's IP is used. Both are hashed before storing, and counters expire after 2 days.

Change them in `wrangler.toml`. Over a limit the worker returns `429 { "error": "quota", "scope": "device" | "daily" }`.
Failed try-ons are given back. If the KV store is missing, the worker refuses every try-on rather than running without limits.

Planned pricing (see PROPOSAL-premium-family-rename.md): Individual €4.99 with 30 try-ons a month, Family €7.99 with 50.
Worst case that's $2.10 and $3.50 of fal cost, leaving ~$2.50 and ~$3.90 a month after Apple's 15%. If fal prices rise, lower the caps first.

## Later, before launch
- Replace the shared APP_TOKEN with Apple App Attest plus a check that the user is premium.
- Switch the daily per-device limit to per-plan monthly limits once StoreKit subscriptions exist.
