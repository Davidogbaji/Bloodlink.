# BloodLink ColdChain

Real-time blood inventory + cold-chain risk network for Nigerian hospitals.
100% free tier: Next.js + Supabase + Vercel. No paid APIs, no AI dependency.

## What it solves

1. **Inter-hospital search gap** — a public, no-login board (`/`) shows live
   blood availability by state, replacing phone-chain searches.
2. **Expiration waste** — every batch is tracked with a strict shelf-life
   countdown, visualized as a radial "pulse ring" (safe → warning → critical).
3. **Intermittent network** — every write goes through an offline queue
   (`lib/offlineQueue.js`). If the device is offline or a request fails, the
   write is stashed in `localStorage` and auto-replayed the moment
   connectivity returns. A service worker (`public/sw.js`) also caches the
   app shell so stale data still renders with zero signal.
4. **NEPA / power outages threaten the cold chain** — `/dashboard` lets staff
   log an outage start/end and whether generator backup is running. If an
   outage with no backup passes 4 hours, the dashboard flags a **cold-chain
   risk** banner so units can be redistributed before spoilage — this is the
   piece that's genuinely novel versus a plain inventory tracker.
5. **Donor mobilization** — `/donors` is a lightweight donor registry.
   Hospitals click "Notify on WhatsApp" to reach nearby donors of a specific
   type via `wa.me` deep links — zero-cost, no SMS gateway, works on any
   phone with WhatsApp installed (extremely high penetration in Nigeria).

## Setup

1. Create a free project at [supabase.com](https://supabase.com).
2. Open the SQL Editor and run `sql/schema.sql` in full.
3. Copy `.env.local.example` to `.env.local` and fill in your project URL +
   anon key (Project Settings → API).
4. Install and run:
   ```bash
   npm install
   npm run dev
   ```
5. Visit `http://localhost:3000` for the public board, `/dashboard` for
   hospital staff, `/donors` for the donor registry.
6. Deploy: push to GitHub, import into Vercel, add the same two env vars in
   the Vercel dashboard. Free tier covers this comfortably.

## Demo script for judges (~3 min)

1. Open `/` — public board, no login, filter by state, show a shortage
   (0-unit card pulsing red).
2. Open `/dashboard` in a second tab — add a batch, watch the public board
   update instantly (Supabase Realtime, no refresh).
3. Turn off WiFi mid-add — show the "unsynced" badge, reconnect, show it
   auto-flush. This is the offline-resilience story.
4. Click "Log power outage" without generator backup, fast-forward the
   narrative ("4 hours later…") to show the cold-chain risk banner — this is
   the line no generic inventory app has.
5. Go to `/donors`, click "Notify on WhatsApp" on an O- donor — show the
   pre-filled WhatsApp message opening. Zero API cost, instant mobilization.

## Stack

- Next.js 14 (App Router) + Tailwind, hosted on Vercel free tier
- Supabase Postgres + Realtime (free tier)
- Browser `localStorage` + Service Worker for offline resilience
- `wa.me` WhatsApp deep links for donor mobilization (no SMS API)
- Pure client-side Haversine for distance sorting (no Maps API)

## File map

```
app/
  page.jsx              public SOS board (hero)
  dashboard/page.jsx     hospital staff inventory + outage log
  donors/page.jsx        donor registry + WhatsApp mobilize
  layout.jsx / globals.css
components/ExpiryRing.jsx  signature radial expiry countdown
lib/
  supabaseClient.js
  utils.js              states, blood types, expiry, distance, wa.me links
  offlineQueue.js        offline-first write queue + auto-sync
sql/schema.sql           full DB schema incl. donors + outage_logs
public/sw.js              service worker (app-shell caching)
```
