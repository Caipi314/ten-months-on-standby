# Standby Passport ✈︎

A personal flight passport PWA for standby travel. It has a 3D globe of every route you've flown, a cleared/bumped log, trips, lifetime stats, visited countries and badges.

## Run locally

```bash
npm install
npm run dev        # http://localhost:5173 (also on your LAN, for testing on the phone)
npm run build      # production build in dist/
```

## Install on iPhone

Every push to `main` deploys to GitHub Pages through `.github/workflows/deploy.yml`. Open **https://caipi314.github.io/ten-months-on-standby/** in **Safari → Share → Add to Home Screen**.

## Auto-fill by flight number (AeroDataBox)

1. Create an account at rapidapi.com and subscribe to **AeroDataBox** (the free Basic tier is enough for personal logging).
2. Copy your `X-RapidAPI-Key` into **Passport → ⚙︎ Settings → Flight lookup**.

The key is stored only on your device.

## Cloud sync (Supabase)

1. Create a free project at supabase.com.
2. In the SQL Editor, run [`supabase/schema.sql`](supabase/schema.sql). It creates the `flights` and `trips` tables with row-level security.
3. Copy the **Project URL** and **anon public key** from Project Settings → API into **Settings → Cloud sync**, then create an account or sign in.

Data is cached on the device and works offline. Changes sync when you're back online.

## Data

- Airports come from [OurAirports](https://ourairports.com/data/) (public domain). To regenerate them, run `node scripts/build-airports.mjs airports.csv src/data/airports.json`.
- Country shapes come from `world-atlas` (Natural Earth).
