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
   npx wrangler deploy
   ```
3. Copy the printed URL (like `https://digicloset-tryon.<you>.workers.dev`) and the APP_TOKEN into
   `DigiCloset/Services/TryOnConfig.swift`.

## Later, before launch
- Replace the shared APP_TOKEN with Apple App Attest plus a check that the user is premium.
- Add a per-user daily limit so a leaked token can't run up the fal bill.
