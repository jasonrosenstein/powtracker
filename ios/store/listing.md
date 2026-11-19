# App Store listing

What goes into App Store Connect for the first version. Screenshots are in `screenshots/`
(1320 x 2868, the 6.9-inch size; `node scripts/store-shots.ts` retakes them).

## App

| Field | Value |
|---|---|
| Name | Powtracker: Snow Forecast |
| Subtitle | Ski snowfall, 14 days ahead |
| Bundle ID | `app.powtracker.ios` |
| SKU | `powtracker-ios` |
| Primary category | Weather |
| Secondary category | Sports |
| Age rating | 4+ (no restricted content) |
| Price | Free, with an in-app subscription |
| Support URL | https://powtracker.app/support.html |
| Marketing URL | https://powtracker.app/ |
| Privacy policy URL | https://powtracker.app/privacy.html |
| Licence agreement | Apple's standard EULA |
| App privacy | Data not collected |
| Encryption | None beyond the system's (declared in Info.plist) |

**Promotional text**

Where is it going to snow? Powtracker ranks 1,750 ski mountains by the snow on the way, from eight weather models.

**Description**

Powtracker shows how much snow is coming to every major ski mountain in the world, and when.

Eight independent weather models are combined into one forecast for each mountain, worked out for its real elevations. See which mountains get the most snow, how sure the models are, and what the mountain looks like today.

FREE
• Snowfall for the next 3 days at 1,750 mountains, ranked
• Snow that fell in the last 24 hours, measured at official stations where there is one
• Trail maps for every mountain
• Live lifts and trails at about 100 mountains that publish them
• Season opening dates, summit weather and avalanche danger
• One saved mountain

POWTRACKER PRO
• The 7-day and 14-day outlook, day by day
• Base, mid and summit forecasts, and the snow line
• Filter by Ikon, Epic, Indy, Mountain Collective, Power Pass and Magic Pass
• All eight weather models side by side, and how far they agree
• Animated forecast maps and hour-by-hour summit weather
• Unlimited saved mountains

Powtracker Pro is $2.99 a month after a 7-day free trial. Payment is charged to your Apple Account. The subscription renews automatically unless cancelled at least 24 hours before the end of the period. Manage or cancel it in your Apple Account's subscriptions.

Forecasts are estimates. Check the resort and the official avalanche forecast before you go.

Terms of use: https://powtracker.app/terms.html
Privacy policy: https://powtracker.app/privacy.html

**Keywords** (100 characters; no pass names, since Apple refuses other companies' trademarks here)

ski,snow,forecast,powder,snowboard,resort,trail map,snowfall,weather,mountain,lifts,skiing,report

The live values are in `listing.json`; `node scripts/asc-listing.mjs` applies them, and
`asc-subscription.mjs` and `asc-testflight.mjs` set up the subscription and the test group.

## Subscription

| Field | Value |
|---|---|
| Subscription group | Powtracker Pro |
| Reference name | Pro Monthly |
| Product ID | `app.powtracker.pro.monthly` |
| Duration | 1 month |
| Price | $2.99 (United States; Apple's equivalents elsewhere) |
| Introductory offer | Free trial, 1 week, new subscribers |
| Display name | Powtracker Pro |
| Description | The 14-day outlook, base and summit forecasts, pass filters |

## Notes for App Review

Powtracker needs no account. To see the subscription, tap "Try Pro" at the top right, or tap
"7 days" in the forecast bar. Pro features: the 7- and 14-day forecast periods, the Base and
Summit elevation buttons, season-pass filters, the model charts on a mountain's page, map
layers, and saving more than one mountain. Purchases are verified on the device with
StoreKit 2; "Restore purchases" is at the bottom of the same sheet.
