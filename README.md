# Powtracker

Forecast snowfall for ski mountains worldwide over the next 3, 7 and 14 days, triangulated from
eight weather models, at the base, the middle and the summit of each mountain. Sort by snowfall,
vertical drop, base or summit elevation; filter by season pass, region and size; see it on a map
with live radar and animated model weather.

It is a static site (Vite, React, TypeScript) plus a few Node scripts that build its data. There
is no server: the browser loads a snapshot for the rankings and fetches live model data straight
from Open-Meteo when a mountain is opened.

Built for a phone first: search and the snowfall period stay pinned, filters open as a sheet,
Rankings, Map and Saved sit in a bottom bar, and it can be added to the home screen. Wide screens
get every control inline and a sortable table. Saved mountains and preferences stay in the
browser; nothing is sent anywhere.

## Run it

Needs Node 23.6 or newer (the scripts are TypeScript run directly by Node).

```bash
npm install
npm run dev          # the app, with the committed data snapshot
npm test             # the snow engine, the forecast summary, sorting and filtering
npm run build        # typecheck and build into dist/
```

With the build served (`npx vite preview --port 4173`) and Chrome installed, `npm run check:ui`
drives the app on a wide screen and a phone and checks sorting, filters, saved mountains, the
detail screen and the map animations; `npm run shots` saves screenshots of every view.

## How the numbers are made

1. **Mountains.** `scripts/build-resorts.ts` takes every named, operating downhill ski area from
   [OpenSkiMap](https://openskimap.org) (elevations come from the runs and lifts mapped in
   OpenStreetMap) and keeps those with 300 m or more of vertical, plus any smaller one a pass
   covers. Pass rosters live in `data/passes/`; hand corrections in `data/overrides.json`.
2. **Models.** `scripts/ingest.ts` asks [Open-Meteo](https://open-meteo.com) for hourly
   precipitation and temperature from eight independent models (`src/lib/models.ts`) at each
   mountain's mid elevation, 3 days back and 15 days ahead.
3. **Snow at each height.** `src/lib/snow.ts` turns that into snowfall at any elevation:
   temperature is moved up or down the mountain at 6.5 °C per km, precipitation becomes snow
   below about +1 °C, and colder air makes deeper snow from the same water (the snow-to-liquid
   ratio runs from 5:1 near +2 °C to 17:1 near -15 °C). The models' own snowfall fields are not
   used: they describe a grid cell tens of kilometres wide at a fixed 7:1 ratio.
4. **Consensus.** `src/lib/forecast.ts` averages the models hour by hour, each for as long as it
   reaches, and sums the hours into windows. The range is the lowest and highest model among
   those covering the whole window: eight models for 3 days, six for 7, three for 14.
   Confidence is high when the middle half of the models sit within a band half as wide as the
   total, medium within a band as wide as the total, low beyond; 14 days never rates above medium.
5. **Measurements.** `scripts/ingest-obs.ts` pulls snow depth and new snow from ground stations
   and matches each to mountains within 10 km at a comparable height. One source so far (SLF,
   Switzerland); each new source is one adapter function in that file.

The same engine runs in the browser for a mountain's detail view, on a fresh fetch, so its charts
are newer than the rankings snapshot and can differ from it slightly.

## Refreshing the data

```bash
npm run data:refresh             # forecast snapshot + station measurements, about 10 minutes
node scripts/ingest.ts --resume  # reuse the raw model output on disk; fetch only what is missing
npm run data:skiareas && npm run data:resorts   # rebuild the mountain list (then ingest --resume)
```

The free tier also allows 5,000 calls an hour, counted by clock hour and by network address. A
full refresh plus anything else in the same hour can exhaust it, and then every browser behind
that address (a phone on the same Wi-Fi) gets the snapshot fallback instead of live charts until
the hour turns. Use `--resume` rather than a second full run.

`.github/workflows/refresh.yml` does the refresh twice a day and publishes the site to GitHub
Pages. On Open-Meteo's free tier (10,000 calls a day and 300,000 a month, non-commercial use
only) one refresh costs about 2.1 calls per mountain: about 3,600 for the 1,750 tracked. Set `OPEN_METEO_API_KEY` to use a paid plan: it lifts the limits,
allows commercial use, and makes tracking every ski area in OpenSkiMap (about 4,400) affordable.

## Known limits

- Elevations are only as good as the OpenStreetMap mapping. Linked areas often appear both
  combined and as their parts (Les Trois Vallées and Val Thorens).
- Models at 9 to 25 km cannot see a single ridge: totals are best read as a comparison between
  mountains and between models, and the 14-day column as a guide to the pattern.
- "Last 24 / 72 hours" is a model estimate everywhere except where a station measurement exists.
- Pass rosters are a snapshot of each pass's own listing for the season named in the file, and
  record included days at the top tier only. See `data/passes/README.md`.

## Data and licences

Forecasts: Open-Meteo (CC BY 4.0), from ECMWF, NOAA, DWD, Environment Canada, JMA, the UK Met
Office and Météo-France. Mountains: OpenSkiMap and OpenStreetMap contributors (ODbL). Basemap:
OpenFreeMap, OpenMapTiles. Radar: RainViewer. Station measurements: WSL Institute for Snow and
Avalanche Research SLF.
