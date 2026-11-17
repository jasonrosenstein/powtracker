// Live lift and trail status, read in the browser from the resort operator's own public feed
// the moment a mountain is opened. Only resorts whose operator publishes such a feed for any
// website to read are covered; for every other mountain the app links to the resort's site.
import type { Resort } from './types.ts'

/**
 * Resorts served by the mtnpowder.com feed (Alterra Mountain Company's resorts), keyed by the
 * first eight characters of the mountain's id. Found by listing the feed's ids on 2026-11-17
 * (scripts/probe/mtnpowder-ids.mjs) and matching names; only ids that carry lift and trail data
 * are listed.
 */
const FEEDS: Record<string, number> = {
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

/** The feed id for a mountain, or null when its operator publishes no open feed. */
export function liveFeedFor(resort: Pick<Resort, 'id'>): number | null {
  return FEEDS[resort.id.slice(0, 8)] ?? null
}

export type OpenState = 'open' | 'closed' | 'hold' | 'scheduled'

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
  area: string
  state: OpenState
  statusText: string
  /** The resort's own rating: Green, Blue, Blue-black, Black, Double black, Extreme or Park. */
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
  /** "Open", "Closed", as the resort states it. */
  operating: string
  updated: Date
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

/** The resort's wording reduced to four states. Anything unrecognised counts as closed. */
export function openState(status: string): OpenState {
  const s = status.toLowerCase()
  if (/hold|delay|standby|wind|weather/.test(s)) return 'hold'
  if (/schedul|expected|opening|pending/.test(s)) return 'scheduled'
  if (/^open|groomed|^on$/.test(s) || s === 'open') return 'open'
  return 'closed'
}

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

/** Turn a feed document into what the app shows. `today` picks the lift hours for that weekday. */
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
  return {
    name: text(feed.Name),
    operating: text(feed.OperatingStatus) || 'Unknown',
    updated: new Date(text(feed.LastUpdate) || Date.now()),
    lifts: lifts.filter((l) => l.name),
    trails: trails.filter((t) => t.name),
    snow,
    alert: plain(text(report.Alert)),
    parking: ((feed.ParkingLots as { Name?: string }[] | undefined) ?? []).map((p) => text(p.Name)).filter(Boolean),
  }
}

export async function fetchLiveStatus(feedId: number, signal?: AbortSignal): Promise<LiveStatus> {
  const res = await fetch(`https://www.mtnpowder.com/feed?resortId=${feedId}`, { signal })
  if (!res.ok) throw new Error(`the resort's status feed returned HTTP ${res.status}`)
  return parseFeed((await res.json()) as Record<string, unknown>)
}

export interface Tally {
  open: number
  total: number
}
export const tally = (items: readonly { state: OpenState }[]): Tally => ({ open: items.filter((i) => i.state === 'open').length, total: items.length })
