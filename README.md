# Powtracker

Live at **https://powtracker.app/**

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
5. **Measurements.** `scripts/ingest-obs.ts` pulls snow depth and measured snowfall from about
   12,900 official ground stations and matches each mountain to the nearest one within 10 km
   that stands between 200 m below its base and 300 m above its summit. Sources: NOAA NOHRSC
   station reports (United States), JMA AMeDAS (Japan), SLF (Switzerland), GeoSphere Austria,
   the avalanche services of Tirol, South Tyrol and Trentino, and British Columbia's snow
   weather stations. Automated depth sensors fail in recognisable ways, so a deep reading is
   kept only if neighbouring stations support it. Where a station measured the last 24 or 72
   hours, that figure replaces the model estimate and is marked as measured. Each new source
   is one adapter function in that file.

The same engine runs in the browser for a mountain's detail view, on a fresh fetch, so its charts
are newer than the rankings snapshot and can differ from it slightly.

## The mountain itself

Each mountain has a second tab for the day on the hill:

- **Trail map.** `scripts/build-trails.ts` packs every tracked mountain's downhill runs and
  operating lifts from OpenSkiMap (OpenStreetMap) into `public/data/trails/<id>.json`: 80,000
  runs and 16,000 lifts, 11 MB in all, committed. The app draws them over shaded terrain
  (Mapzen terrain tiles on AWS Open Data), coloured by the difficulty convention of the region:
  green, blue, black and double black in North America; green, blue, red and black in Europe;
  green, red and black in Japan. A 3D button tilts the map onto real terrain.
- **Live lifts and trails.** Where the resort publishes a status feed that any website may read,
  the browser reads it when the mountain is opened. Two feeds are read, both listed in
  `src/lib/status.ts`: Alterra's (mtnpowder.com; 16 North American resorts, with grooming, lift
  hours and the resort's own snow report) and Intermaps' (winter.intermaps.com; 85 mountains in
  Austria, Switzerland, Germany, Italy and France, including Ski Arlberg, Sölden, Kitzbühel,
  Ischgl, Davos, Verbier and Portes du Soleil). Mapped runs are matched to the report by sign
  number, then by name; where most are found, colour on the trail map means "reported open
  today" and everything else is grey. Every other mountain says that its live status is on the
  resort's site, and links to it.
- **Opening dates.** `data/openings/*.json` holds what each mountain has announced for the
  season (open since a day, a set opening day, a hoped-for one, no date yet, or not opening)
  in the source's own words, with the page that states it and the day it was read;
  `npm run data:openings` builds `public/data/openings.json` from them. The app shows the
  announcement, its source and that day: quotation marks only around words taken from the page,
  plain text for a summary. A date that comes from a ski guide (Skiresort.com, whose dates
  matched the operators' about three times in four) is called "expected" and says whose it is.
  A planned date that has passed is shown as planned, never as "open". Only mountains with a
  page that states something are listed: 643 of the 1,752 on 17 November 2026.
- **On the mountain.** Summit temperature and wind chill, wind and gusts with a lift-hold
  warning, visibility, sunrise and sunset, hour by hour for a day and a half (Open-Meteo).
- **Avalanche danger** beyond the ski-area boundary, from avalanche.org (United States) and
  Avalanche Canada.
- **Getting there.** Directions, the resort's site, and its official trail maps on skimap.org.

To rebuild the trail maps: `npm run data:trailsource` (downloads about 1 GB), then
`npm run data:trails`.

## Powtracker Pro and the iPhone app

`src/lib/plan.ts` says what is free and what is Pro ($2.99 a month, 7-day trial), and why;
`node scripts/pricing-scenarios.ts` prints the comparison the split was chosen from. The paywall
is in force in the iPhone app and in a build made with `VITE_PAYWALL=on`. Opening the site with
`?paywall=on` previews the free plan in that tab; otherwise the site shows everything.

The iPhone app (`ios/`, made with Capacitor) is this site in a native shell. It reads its data
from powtracker.app, so a forecast refresh needs no app update. The subscription is bought and
verified on the device with StoreKit 2 (`ios/App/App/SubscriptionsPlugin.swift`, bridged in
`src/lib/store.ts`): no server and no accounts.

```bash
sh scripts/ios-sync.sh        # build with the paywall on and copy into the Xcode project
xcodebuild -project ios/App/App.xcodeproj -scheme App -destination 'generic/platform=iOS Simulator' build
node scripts/make-icons.ts    # the app icon and launch image, from public/icon.svg
node scripts/store-shots.ts   # App Store screenshots
```

`ios/store/listing.md` holds the App Store listing text and the subscription's settings.

On the website Pro is bought by card through Stripe Checkout. `pay/` holds three small
functions for Vercel (`checkout`, `claim`, `status`) that need `STRIPE_SECRET_KEY`,
`STRIPE_PRICE_ID` and `TOKEN_SECRET` in their environment. Building the site with
`VITE_PAY_URL` set to their address turns the paywall on and sells Pro there. There are no
accounts: the browser keeps a signed token that is re-checked against Stripe on each visit, and
a subscriber's "Pro link" carries it to another device. `node scripts/probe/web-checkout.ts`
runs the whole flow in a browser against a stand-in for Stripe.

Before Pro is sold, the data licences that are free only for non-commercial use have to be
settled: Open-Meteo needs its paid plan (set `OPEN_METEO_API_KEY`; the app must then stop
calling the free API from the device), and RainViewer's radar is for personal use, so it is
hidden wherever the paywall is on.

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
Pages, which serves it at powtracker.app: the domain is registered and has its DNS at Vercel
(address records for GitHub Pages, and `www` pointing at the github.io name), and is set as the
custom domain in the repository's Pages settings. On Open-Meteo's free tier (10,000 calls a day and 300,000 a month, non-commercial use
only) one refresh costs about 2.1 calls per mountain: about 3,600 for the 1,750 tracked. Set `OPEN_METEO_API_KEY` to use a paid plan: it lifts the limits,
allows commercial use, and makes tracking every ski area in OpenSkiMap (about 4,400) affordable.

## Known limits

- Elevations are only as good as the OpenStreetMap mapping. Linked areas often appear both
  combined and as their parts (Les Trois Vallées and Val Thorens).
- Models at 9 to 25 km cannot see a single ridge: totals are best read as a comparison between
  mountains and between models, and the 14-day column as a guide to the pattern.
- About a third of mountains have a station close enough to measure them (two thirds in the
  US, Austria and Switzerland; none yet in France, Norway or most of Canada). Elsewhere "last
  24 / 72 hours" is a model estimate and there is no snow depth. Not yet connected: SNOTEL
  directly (its server was down when this was built; many of its stations arrive through
  NOAA), Météo-France's live observations (free key required; its open daily files run days
  behind), MET Norway (free key required).
- Station measurements are not the resorts' own snow reports. Live lift and trail status is
  shown for about 100 mountains whose feed is open to other sites. The rest (Vail Resorts'
  mountains, Boyne, Powdr, most independents, Japan) publish theirs only on their own sites or
  through licensed data feeds: covering every mountain needs one of those feeds (OnTheSnow,
  SnoCountry, Skiresort.info), which is a paid agreement.
- Opening dates are announcements collected on one day; resorts move them with the weather.
- Trail maps are as complete as OpenStreetMap's mapping of each mountain. Live status is matched
  to mapped runs by name, so a run the resort names differently shows grey.
- Pass rosters are a snapshot of each pass's own listing for the season named in the file, and
  record included days at the top tier only. See `data/passes/README.md`.

## Data and licences

Forecasts: Open-Meteo (CC BY 4.0), from ECMWF, NOAA, DWD, Environment Canada, JMA, the UK Met
Office and Météo-France. Mountains: OpenSkiMap and OpenStreetMap contributors (ODbL). Basemap:
OpenFreeMap, OpenMapTiles. Radar: RainViewer. Station measurements: NOAA National Operational
Hydrologic Remote Sensing Center; Japan Meteorological Agency; WSL Institute for Snow and
Avalanche Research SLF; GeoSphere Austria (CC BY 4.0); the avalanche warning services of Tirol,
South Tyrol and Trentino via avalanche.report (CC BY 4.0); Government of British Columbia (Open
Government Licence). Trail maps: OpenSkiMap, OpenStreetMap contributors (ODbL); terrain: Mapzen
terrain tiles, AWS Open Data. Live resort status: each resort, through Alterra Mountain
Company's and Intermaps' public feeds. Avalanche danger: avalanche.org and Avalanche Canada.
