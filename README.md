# Tomorrowland 2026 · Consciencia — Group Companion App

One shareable link. Friends open it, enter a name once, and get a four-tab,
mobile-first app to coordinate Tomorrowland 2026 **Weekend 2**
(Fri 24 – Sun 26 July 2026 · De Schorre, Boom, Belgium).

**Tabs:** 🎵 Lineup · 🗓️ Itinerary · 🗺️ Map · 💰 Expenses

Built with React + Vite + Supabase (Realtime). All data syncs live across
everyone's devices.

---

## 1. Local setup

```bash
cd "<this folder>"
npm install
cp .env.example .env      # then fill in the values (see §2)
npm run dev               # http://localhost:5173
```

## 2. Environment variables

Create `.env` (never commit it — it's git-ignored). From your Supabase project
→ **Project Settings → API**:

| Variable | Where to find it | Used by |
|---|---|---|
| `VITE_SUPABASE_URL` | Project URL | client + scripts |
| `VITE_SUPABASE_ANON_KEY` | Project API keys → **anon / public** (publishable) | client |
| `SUPABASE_SERVICE_ROLE_KEY` | Project API keys → **service_role** (secret) | seed script only — **never** ships to the browser |
| `VITE_EXCHANGERATE_API_KEY` | https://exchangerate.host access key | client (EUR→SGD rate) |

If the exchange-rate call fails, the app falls back to an approximate rate
(1 EUR ≈ 1.45 SGD) and shows a small warning banner.

## 3. Create the database (one time)

1. Open your Supabase project → **SQL Editor → New query**.
2. Paste the contents of [`schema.sql`](./schema.sql) and **Run**.
   This creates all five tables (`members`, `lineup`, `itinerary_items`,
   `locations`, `expenses`), enables **Realtime** on each, and applies the
   permissive RLS policies (auth is via a localStorage session token, like
   the Vinabae app). Safe to re-run.

## 4. Seed / re-sync the lineup

The official Weekend-2 lineup is already captured in
`scripts/lineup_seed.json` and bundled in `public/` (the app shows it even
before seeding). To load it into Supabase:

```bash
npm run seed        # upserts scripts/lineup_seed.json into the lineup table
```

**Later, when set times are published (or to refresh the lineup):**

```bash
npm run scrape      # re-pulls official data → rewrites lineup_seed.json
npm run seed        # upserts (no duplicates — keyed on day+artist+stage)
```

`npm run scrape` reads the official Tomorrowland lineup CDN
(`artist-lineup-cdn.tomorrowland.com`), discovering the event id + uuid from
the live page automatically. `start_time`/`end_time` stay `null` ("Time TBA")
until the festival publishes the timetable; when they do, the scraper picks
them up and they snap into the Itinerary calendar grid. You can also feed me
updated data and I'll regenerate `lineup_seed.json`.

> Set times for Weekend 2 are **not yet published** by Tomorrowland
> (`withTimetable: false`), so every set currently shows **Time TBA** — this is
> expected, and the app is built around it.

## 5. Deploy to Vercel

1. Push this folder to a GitHub repo (`.env` is git-ignored — safe).
2. In Vercel → **Add New → Project** → import the repo.
   Framework preset auto-detects **Vite** (`vercel.json` is included).
3. **Settings → Environment Variables** — add the same vars as your `.env`:
   `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_EXCHANGERATE_API_KEY`.
   (`SUPABASE_SERVICE_ROLE_KEY` is **not** needed on Vercel — it's only for the
   local seed script. Leave it out of the client deployment.)
4. **Deploy.** Vercel gives you the one shareable URL.

> The seed script runs on **your machine**, not on Vercel. Run `npm run seed`
> locally once (after creating the tables) so the lineup is in the database.

## 6. Invite friends

Just send them the Vercel URL. Each person enters a display name once, gets a
distinct bright colour, and joins the same shared world. The **🔗 Share**
button (top-right of the Lineup tab) copies the link to the clipboard.

---

## Features

- **Lineup** — all 356 Weekend-2 sets (15 stages). Day filter (All/Fri/Sat/Sun),
  search & sort by artist or stage, one-tap **Add to itinerary**.
- **Itinerary** — shared & group-editable. 24h vertical calendar; TBA tray for
  unscheduled sets; each set tagged with the colour-avatar of who added it
  (stacked when multiple people add the same set); overlapping sets render
  side-by-side; edit times / remove with soft confirm.
- **Map** — Leaflet/OpenStreetMap centred on De Schorre; live member GPS dots
  (colour-coded, "last seen X mins ago"); `watchPosition` while open + a Web
  Worker heartbeat for background pings; pause-sharing toggle.
- **Expenses** — EUR/SGD with live rate + refresh; Equal / Custom / By-Unit /
  Everyone-paid-own splits; edit any field; settlement with minimum-transaction
  debt simplification + mark-as-settled history; analytics report (by category,
  by day & category, per person, total) exportable to PDF.

## Project structure

```
schema.sql                 ← run in Supabase SQL editor
scripts/scrape-lineup.mjs  ← official lineup scraper (npm run scrape)
scripts/seed-lineup.mjs    ← upsert into Supabase (npm run seed)
public/lineup_seed.json    ← bundled lineup (display fallback)
src/
  App.jsx                  ← shell, identity, members realtime
  components/Landing.jsx   ← Consciencia welcome / name capture
  components/BottomNav.jsx
  components/tabs/*.jsx     ← Lineup, Itinerary, Map, Expenses
  lib/*.js                 ← colors, identity, currency, expenses, festival
  worker/locationWorker.js ← background location heartbeat
```
