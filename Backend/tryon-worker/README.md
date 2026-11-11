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

The worker controls spending itself, so a patched app, a leaked token or a bug that loops can't drain the fal account. There are five layers:

1. **Money budgets for the whole app**, counted in dollars of fal cost (a try-on counts as $0.08, a pet or accessory edit as $0.04, both rounded up):
   - `DAILY_BUDGET_USD` (default 15) per UTC day
   - `MONTHLY_BUDGET_USD` (default 150) per calendar month
   Once a budget is reached, try-on stops until the next day or month (`429 { "scope": "budget" }`).
2. **Per-phone limits:** `DEVICE_DAILY_LIMIT` (default 10) and `DEVICE_MONTHLY_LIMIT` (default 60, above Family's 50) try-ons, giving `429 { "scope": "device" | "device-month" }`. The app sends a random `X-Device-Id` kept in the Keychain, so reinstalling doesn't reset it. Without the header the caller's IP is used. Both are hashed before they're stored.
3. **Emergency stop**, with no deploy needed:
   ```
   npx wrangler kv key put --binding QUOTA config:paused 1     # stop all try-ons now
   npx wrangler kv key delete --binding QUOTA config:paused    # resume
   ```
   Or set `PAUSED = "true"` in `wrangler.toml` and deploy. The app then shows "Try-on is taking a short break".
4. **See what's been spent:** set an admin secret once (`npx wrangler secret put ADMIN_TOKEN`), then run:
   ```
   curl -H "X-Admin-Token: <token>" https://<your-worker>/usage
   ```
   This returns today's and this month's spend against the budgets.
5. **fal prepaid credits (the backstop):** fal draws from prepaid credits and rejects requests when they run out. Keep auto top-up off and load only what you're willing to lose in a worst case, for example one month's budget.

Failed try-ons are given back. If the KV store is missing, the worker refuses every try-on rather than running without limits. KV isn't transactional, so a burst of parallel requests can overshoot a limit by a few cents. Each request uses 2 KV reads and 2 writes; the free plan allows 1,000 writes a day (about 500 try-ons), and the $5 Workers Paid plan removes that ceiling.

If fal changes its prices, update `COST_CENTS` in `src/index.js`.

Planned pricing (see PROPOSAL-premium-family-rename.md): Individual €4.99 with 30 try-ons a month, Family €7.99 with 50.
Worst case that's $2.10 and $3.50 of fal cost, leaving ~$2.50 and ~$3.90 a month after Apple's 15%. If fal prices rise, lower the caps first.

## Later, before launch
- Replace the shared APP_TOKEN with Apple App Attest plus a check that the user is premium.
- Check the plan on the server (signed App Store transaction), so per-plan monthly limits (30 / 50) are enforced there too, not only in the app.
