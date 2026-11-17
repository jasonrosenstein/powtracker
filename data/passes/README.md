# Pass rosters

One JSON file per season pass, read by `scripts/build-resorts.ts`. Each destination lists the
OpenSkiMap ski-area ids the pass covers there; a mountain in the tracker carries a pass tag when
a destination names its id, is `confirmed`, and is not `kind: "discount"`.

Every file was compiled on 2026-11-16 for the 2026/27 season from the pass's own website, with
the page that lists each destination recorded in its `url`. No entry rests on a secondary source
or on memory. Ids were matched against `data/build/skiareas-index.tsv` (`npm run data:index`).

| File | Pass | Destinations | Ski areas tagged | Source read |
|---|---|---|---|---|
| `ikon.json` | Ikon Pass | 92 (78 destinations + 14 Bonus Mountains) | 168 | ikonpass.com access-details file and content API |
| `epic.json` | Epic Pass | 59 (42 owned + 17 partners) | 94 | epicpass.com pass and partner pages |
| `indy.json` | Indy Pass | 254 (249 partners, 5 discount-only) | 279 | indyskipass.com resort list and all resort pages |
| `mountain-collective.json` | Mountain Collective | 28 (27 + Mt. Norquay, discount-only) | 40 | mountaincollective.com resort pages |
| `power.json` | Power Pass | 15 | 15 | thepowerpass.ski (powerpass.com is not the pass site) |
| `magic.json` | Magic Pass | 95 | 100 | magicpass.ch |

## What a tag does and does not mean

A tag means the pass's top-tier product includes days at that mountain this season. It does not
say how many, and several things the passes do are flattened:

- **Lower tiers differ.** Ikon Base leaves out Alta, Jackson Hole, Snowbasin, Sun Valley and the
  Bonus Mountains; Epic Local leaves out most partners abroad and has peak-date exclusions; the
  Power Pass has six products. The lower tier's terms are kept in each destination's `lower`
  field where the pass states them, but the tracker does not filter by them yet.
- **Days are often pooled.** Epic's six Canadian Rockies resorts share 7 days; Indy's Innsbruck
  and Portes du Soleil entries are 2 days across a dozen areas; Power's two Chilean resorts
  share 10. The tag reads the same as unlimited access.
- **Windows and blackouts.** Australian resorts on Epic are for the 2027 southern winter. The
  Power Pass states its Chile days "for the 2026 season", which has ended. Indy's 2026/27
  blackout list was still being compiled.
- **Linked areas appear several times.** OpenSkiMap holds both combined areas and their parts
  (Les 3 Vallées, Dolomiti Superski, Portes du Soleil), so one destination can tag many rows.

## Entries worth a second look

- Not shown as covered: Hesperus (Power; absent from the 2026/27 list), Eagle Point (Indy;
  closed for the season after a wildfire), Windham (Ikon; not on the access list).
- No OpenSkiMap row, so absent from the tracker: Snowstar and Elm Creek (Indy), Riffenmatt
  (Magic). Stoke Mountain and North Cascade Heli (Indy) are not lift-served ski areas.
- Sub-areas included on inference rather than a page naming them (`idsVerified: false`):
  Raudalen with Beitostølen, Fendels with Kaunertal, Hachimantai Panorama with Shimokura (Indy);
  Loveland Valley with Loveland Basin (Power); Les Pléiades second row (Magic).
- Deliberately narrow: Megève on Ikon is the Megève row only; Ski Arlberg on Epic leaves out
  Warth-Schröcken; Zillertal on Epic includes Gerlosstein on the valley-wide wording.
- Magic Pass advertises 103 resorts but names 95; the gap of 8 is unexplained.

## How the research was briefed

The rosters were compiled by four research agents working in parallel. Before their brief went
out, an independent reviewer compared it with the request it served ("choose all popular
passes ... to allow people to sort"). Nothing was blocking; what changed as a result:

| Reviewer's point | Outcome |
|---|---|
| A top-tier roster misleads holders of Ikon Base or Epic Local | Brief changed: lower-tier terms and a coarse `kind` are recorded. Filtering by tier is not built yet. |
| "Confirmed" could not be checked | Brief changed: a source `url` per destination, `idsVerified` for multi-area expansions, and each agent listed its least-sure matches (above). |
| Official sites might not load, silently | Brief changed: agents had to say what blocked them. All six sites were read directly. Driving the user's browser was ruled out. |
| The choice of passes had no criterion and could not be challenged | Brief changed: agents named other passes worth offering. Candidates: Dolomiti Superski, Snow Card Tirol, SuperSkiCard, Aosta Valley, Epic Australia, Chill Pass (NZ), Hakuba Valley, Powder Alliance. |
| A 300 m size floor decides which mountains exist | Kept, because the free forecast tier cannot carry all 4,400 areas; raised with the user as a data-budget decision. |

Three of the four agents also reported that one tag per pass is too coarse a model (pooled
days, tiers, validity windows). That stands as a finding: see "What a tag does and does not
mean".
