// Live lift and trail status, read in the browser from the resort's own public feed the moment
// a mountain is opened. Two feeds are read, both served for any website to use (they answer with
// Access-Control-Allow-Origin: *): Alterra Mountain Company's (mtnpowder.com) for its North
// American resorts, and Intermaps', which runs the interactive maps of many Alpine resorts. For
// every other mountain the app links to the resort's site.
import type { Resort } from './types.ts'

export type Feed = { provider: 'mtnpowder'; id: number } | { provider: 'intermaps'; slug: string }

/**
 * Alterra resorts by feed id, keyed by the first eight characters of the mountain's id. Found
 * by listing the feed's ids on 2026-11-17 (scripts/probe/mtnpowder-ids.mjs) and matching names;
 * only ids that carry lift and trail data are listed.
 */
const MTNPOWDER: Record<string, number> = {
  '29d4f325': 1, // Stratton
  '856ac5fd': 1, // Stratton (mapped twice in OpenStreetMap)
  '1facaf3d': 2, // Snowshoe
  c5f70b63: 3, // Blue Mountain, Ontario
  b7cad93e: 4, // Tremblant
  eac3283b: 5, // Winter Park
  '52670964': 6, // Steamboat
  b7a20021: 49, // Deer Valley
  '78bac123': 57, // Bear Mountain
  '553e5c08': 58, // Snow Summit
  '1f94daed': 59, // June Mountain
  ba4944ec: 60, // Mammoth Mountain
  fa7bea0b: 61, // Palisades Tahoe, Olympic Valley
  '86d9955c': 61, // Palisades Tahoe, Alpine Meadows
  b40e9251: 65, // Solitude
  '51088afb': 70, // Sugarbush
  '89f555b5': 80, // Crystal Mountain, Washington
  '1e281ff3': 93, // Arapahoe Basin
}

/**
 * Intermaps resorts: feed slug, then the mountains it covers. Slugs were found by trying resort
 * names on 2026-11-17 (scripts/probe/intermaps.mjs) and matched to mountains by name
 * (scripts/probe/intermaps-match.mjs). A feed can span several mapped areas.
 */
const INTERMAPS: Record<string, string[]> = {
  skiarlberg: ['53410fc6', '66e67247', 'c5107fc2'], // Ski Arlberg, St. Anton, Lech/Zürs
  warth_schroecken: ['29248afe'],
  soelden: ['78e5f98d'],
  obergurgl_hochgurgl: ['f94a8923'],
  kitzski: ['1eeb56a8'],
  zillertalarena: ['bbbfaa27'],
  mayrhofen: ['0e7ba1fd'],
  hintertuxer_gletscher: ['fd250230'],
  hochfuegen: ['99cef648'], // Hochzillertal-Hochfügen
  stubaier_gletscher: ['99f28ade'],
  silvretta_montafon: ['e61adbd6'],
  golm: ['d6419e85'],
  gargellen: ['08c17237'],
  schladming_dachstein: ['1fd29b02', 'b9dc9702', 'a52b30a5', '5f7de23f'], // with Hauser Kaibling, Planai, Reiteralm
  obertauern: ['b28af962'],
  zell_am_see: ['6ecf3eac'], // Schmittenhöhe
  kitzsteinhorn: ['bc036184'], // Kaprun
  skiwelt: ['37ee9c6b'],
  davos: ['403c8d67', 'c880b001'], // Parsenn, Jakobshorn
  saas_fee: ['fc37a308'],
  arosa_lenzerheide: ['4ae9b0cb'],
  jungfrau: ['d9ac8983', '1d111e03', '1871bd97', '17b19c74'], // Mürren, Grindelwald-Wengen, First, Männlichen
  gstaad: ['6706227f', '7512fc8f', 'c822724e', 'bf17dce5'],
  engelberg: ['97e9df8f', '60ae6a4b'], // Titlis, Brunni
  les_4_vallees: ['fa9477e2'], // Verbier
  portes_du_soleil: ['70b5c16a', '18fc59da', 'b61605e5', 'b2d026c4'], // with Avoriaz, Champéry, Les Gets-Morzine
  kronplatz: ['0295b165'],
  nassfeld: ['5dc251b4'],
  bad_kleinkirchheim: ['b0a93ffd'],
  katschberg: ['723611e5'],
  silvretta_arena: ['7c2f2690'], // Ischgl/Samnaun
  nauders: ['8ebb23da'],
  galtuer: ['0f17e89d'],
  pitztaler_gletscher: ['f1ae030e'],
  axamer_lizum: ['4d065e67'],
  aletsch_arena: ['17756f84'],
  rauris: ['1586f10a'],
  turracher_hoehe: ['75013e89'],
  gerlitzen: ['2c18b681'],
  goldeck: ['6f516f75'],
  moelltaler_gletscher: ['39daafb4'],
  heiligenblut: ['0e26601b'],
  sillian: ['87ac1b90'],
  brandnertal: ['8209eb84'],
  diedamskopf: ['9159a8a2'],
  sonnenkopf: ['3ab1f000'],
  glungezer: ['66e1d0ae'],
  bergeralm: ['e5aebd95'],
  zugspitz_arena: ['d5a7de30', '3b83b24c', 'f0287cd7'], // Lermoos, Ehrwald
  berwang: ['aa79e16f'],
  venet: ['923cbc11'],
  hochzeiger: ['f3b4e79c'],
  tauplitz: ['98392622'],
  loser: ['cfbb98a1'],
  kreischberg: ['c85b6de8'],
  lachtal: ['23c1a9b1'],
  stuhleck: ['1f9b6a39'],
  dachstein_west: ['54b7a2ec'],
  hinterstoder: ['b0bddc47'],
  wurzeralm: ['c59eb5ea'],
  corvatsch: ['13756027'],
  toggenburg: ['696bb1ff', 'a044deed'], // Chäserrugg, Wildhaus
  braunwald: ['e18255e7'],
  hoch_ybrig: ['96ddf9d6'],
  lauchernalp: ['76fbc6ed'],
  graechen: ['9ea685d2'],
  sulden: ['45625a91'],
  nebelhorn: ['a4ab6152'],
  sudelfeld: ['80d2dac2'],
  brauneck: ['2a7a0bf0'],
  feldberg: ['ac6e8db7'],
}
const INTERMAPS_BY_ID = new Map(Object.entries(INTERMAPS).flatMap(([slug, ids]) => ids.map((id) => [id, slug] as const)))

/** The live feed for a mountain, or null when its operator publishes none that others may read. */
export function liveFeedFor(resort: Pick<Resort, 'id'>): Feed | null {
  const key = resort.id.slice(0, 8)
  if (MTNPOWDER[key] != null) return { provider: 'mtnpowder', id: MTNPOWDER[key] }
  const slug = INTERMAPS_BY_ID.get(key)
  return slug ? { provider: 'intermaps', slug } : null
}

/** How many mountains have a live feed. */
export const LIVE_FEED_COUNT = Object.keys(MTNPOWDER).length + INTERMAPS_BY_ID.size

export type OpenState = 'open' | 'closed' | 'hold' | 'scheduled' | 'unknown'

export interface LiveLift {
  name: string
  area: string
  type: string
  state: OpenState
  /** The resort's own wording, e.g. "Closed for Season". */
  statusText: string
  /** Today's hours as the resort gives them, e.g. "8:30 AM – 4:00 PM". */
  hours: string
  wait: string
}

export interface LiveTrail {
  name: string
  /** The run's sign number, where the resort gives one. */
  number: string
  area: string
  state: OpenState
  statusText: string
  /** The resort's own rating: Green, Blue, Blue-black, Red, Black, Double black, Extreme, Ski route or Park. */
  rating: string
  groomed: boolean
}

export interface ResortSnow {
  /** Where on the mountain the figures were taken, e.g. "Mid-Mountain". */
  at: string
  baseCm: number | null
  last24Cm: number | null
  last48Cm: number | null
  last72Cm: number | null
  last7dCm: number | null
  seasonCm: number | null
}

export interface LiveStatus {
  name: string
  /** "Open" or "Closed": as the resort states it, or whether any lift is running. */
  operating: string
  /** When the resort last updated the feed; null when it does not say. */
  updated: Date | null
  lifts: LiveLift[]
  trails: LiveTrail[]
  snow: ResortSnow | null
  /** A notice from the resort, in plain text. */
  alert: string
  parking: string[]
}

const RATINGS: Record<string, string> = {
  GreenCircle: 'Green',
  BlueSquare: 'Blue',
  BlueBlackSquare: 'Blue-black',
  BlackDiamond: 'Black',
  DoubleBlackDiamond: 'Double black',
  ExtremeTerrain: 'Extreme',
  Park: 'Park',
}

/** The resort's wording reduced to a state. Anything unrecognised counts as closed. */
export function openState(status: string): OpenState {
  const s = status.toLowerCase().replace(/_/g, ' ')
  if (s === 'unknown' || s === '') return 'unknown'
  if (/hold|delay|standby|wind|weather/.test(s)) return 'hold'
  if (/schedul|expected|opening|pending|preparation/.test(s)) return 'scheduled'
  if (/^open|groomed/.test(s)) return 'open'
  return 'closed'
}

const STATE_TEXT: Record<OpenState, string> = { open: 'Open', closed: 'Closed', hold: 'On hold', scheduled: 'In preparation', unknown: 'Not reported' }

const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' && v.trim() !== '--' ? Number(v) : NaN
  return Number.isFinite(n) ? n : null
}
const text = (v: unknown): string => (typeof v === 'string' && v.trim() !== '--' ? v.trim() : '')
const plain = (html: string): string => html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()

interface FeedArea {
  Name?: string
  Lifts?: Record<string, unknown>[]
  Trails?: Record<string, unknown>[]
}

/** Read an Alterra (mtnpowder) feed document. `today` picks the lift hours for that weekday. */
export function parseFeed(feed: Record<string, unknown>, today = new Date()): LiveStatus {
  const areas = (feed.MountainAreas as FeedArea[] | undefined) ?? []
  const weekday = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][today.getDay()]
  const lifts: LiveLift[] = areas.flatMap((a) =>
    (a.Lifts ?? []).map((l) => {
      const hours = (l.Hours as Record<string, { Open?: string; Close?: string }> | undefined)?.[weekday]
      const statusText = text(l.Status) || 'Closed'
      return {
        name: text(l.Name),
        area: text(a.Name),
        type: text(l.LiftType),
        state: openState(statusText),
        statusText,
        hours: hours?.Open && hours.Close && text(hours.Open) ? `${hours.Open} – ${hours.Close}` : '',
        wait: text(l.WaitTimeString) || text(l.WaitTime),
      }
    }),
  )
  const trails: LiveTrail[] = areas.flatMap((a) =>
    (a.Trails ?? []).map((t) => {
      const statusText = text(t.Status) || 'Closed'
      return {
        name: text(t.Name),
        number: '',
        area: text(a.Name),
        state: openState(statusText),
        statusText,
        rating: RATINGS[text(t.TrailIcon)] ?? text(t.Difficulty),
        groomed: text(t.Grooming).toLowerCase() === 'yes',
      }
    }),
  )
  const report = (feed.SnowReport as Record<string, unknown> | undefined) ?? {}
  const where = ((report.MidMountainArea ?? report.BaseArea ?? report.SummitArea) as Record<string, unknown> | undefined) ?? null
  const snow: ResortSnow | null =
    where && num(where.BaseCm) != null
      ? {
          at: text(where.Name),
          baseCm: num(where.BaseCm),
          last24Cm: num(where.Last24HoursCm),
          last48Cm: num(where.Last48HoursCm),
          last72Cm: num(where.Last72HoursCm),
          last7dCm: num(where.Last7DaysCm),
          seasonCm: num(report.SeasonTotalCm),
        }
      : null
  const updated = Date.parse(text(feed.LastUpdate))
  return {
    name: text(feed.Name),
    operating: text(feed.OperatingStatus) || 'Unknown',
    updated: Number.isFinite(updated) ? new Date(updated) : null,
    lifts: lifts.filter((l) => l.name),
    trails: trails.filter((t) => t.name),
    snow,
    alert: plain(text(report.Alert)),
    parking: ((feed.ParkingLots as { Name?: string }[] | undefined) ?? []).map((p) => text(p.Name)).filter(Boolean),
  }
}

interface IntermapsItem {
  status?: string
  subtitle?: string
  /** A category code, alone or before the difficulty: 2614 easy, 2615 medium, 2616 difficult, 2617 ski route. */
  type?: string | number
  popup?: { title?: string; number?: string | null; difficulty?: string; subtitle?: string; 'additional-info'?: { difficulty?: string } }
}
// Alpine pistes are blue, red and black; France adds green for the very easy.
const SLOPE_RATING: Record<string, string> = { 'very-easy': 'Green', easy: 'Blue', medium: 'Red', intermediate: 'Red', difficult: 'Black', 'very-difficult': 'Black' }
const TYPE_RATING: Record<string, string> = { '2614': 'Blue', '2615': 'Red', '2616': 'Black', '2617': 'Ski route' }

/** A piste's colour, from whichever of its fields a resort fills in: difficulty, category code, or wording. */
function slopeRating(s: IntermapsItem): string {
  const stated = SLOPE_RATING[s.popup?.difficulty ?? s.popup?.['additional-info']?.difficulty ?? '']
  if (stated) return stated
  const coded = TYPE_RATING[String(s.type ?? '').split('-')[0]]
  if (coded) return coded
  const words = (s.popup?.subtitle ?? s.subtitle ?? '').toLowerCase()
  return /route/.test(words) ? 'Ski route' : /difficult/.test(words) ? 'Black' : /intermediate|medium/.test(words) ? 'Red' : /easy/.test(words) ? 'Blue' : 'Unrated'
}

/** Read an Intermaps feed document: lifts, pistes and ski routes, each open or closed. */
export function parseIntermaps(feed: { lifts?: IntermapsItem[]; slopes?: IntermapsItem[]; routes?: IntermapsItem[] }, slug: string): LiveStatus {
  const lifts: LiveLift[] = (feed.lifts ?? []).map((l) => {
    const state = openState(l.status ?? '')
    return { name: text(l.popup?.title), area: '', type: text(l.popup?.subtitle ?? l.subtitle), state, statusText: STATE_TEXT[state], hours: '', wait: '' }
  })
  const trail = (s: IntermapsItem, route: boolean): LiveTrail => {
    const state = openState(s.status ?? '')
    const number = text(s.popup?.number ?? '')
    const title = text(s.popup?.title)
    return {
      // Titles lead with the sign number ("50 Zammermoos - St. Anton"): keep it apart from the name.
      name: number && title.startsWith(`${number} `) ? title.slice(number.length + 1) : title,
      number,
      area: '',
      state,
      statusText: STATE_TEXT[state],
      rating: route ? 'Ski route' : slopeRating(s),
      groomed: false,
    }
  }
  const trails = [...(feed.slopes ?? []).map((s) => trail(s, false)), ...(feed.routes ?? []).map((s) => trail(s, true))]
  const named = lifts.filter((l) => l.name)
  return {
    name: slug,
    // The feed has no resort-wide status: the mountain is open if a lift is running.
    operating: named.some((l) => l.state === 'open') ? 'Open' : 'Closed',
    updated: null,
    lifts: named,
    trails: trails.filter((t) => t.name || t.number),
    snow: null,
    alert: '',
    parking: [],
  }
}

export async function fetchLiveStatus(feed: Feed, signal?: AbortSignal): Promise<LiveStatus> {
  const url = feed.provider === 'mtnpowder' ? `https://www.mtnpowder.com/feed?resortId=${feed.id}` : `https://winter.intermaps.com/${feed.slug}/data?lang=en`
  const res = await fetch(url, { signal, cache: 'no-cache' })
  if (!res.ok) throw new Error(`the resort's status feed returned HTTP ${res.status}`)
  const body = (await res.json()) as Record<string, unknown>
  return feed.provider === 'mtnpowder' ? parseFeed(body) : parseIntermaps(body, feed.slug)
}

export interface Tally {
  open: number
  /** Everything the resort reports on, open or not. */
  total: number
}
export const tally = (items: readonly { state: OpenState }[]): Tally => ({ open: items.filter((i) => i.state === 'open').length, total: items.length })
