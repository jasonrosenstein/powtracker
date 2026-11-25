// Only the public, credential-free board URL. The operator's own embed also includes
// private query parameters that must never be copied into this app or its data files.
export const BEAR_VALLEY_ID = 'f357cc18'
export const BEAR_BOARD = 'https://weather.te2.io/status?configFile=bear-valley&theme=bear-valley'
export const BEAR_STATUS_PAGE = 'https://www.bearvalley.com/lift-and-trail-status'
export const STATUS_POLL_MS = 5 * 60_000

export interface Bulletin { title: string; excerpt: string; url: string; posted: string }
export interface BulletinFile { checked: string; bulletin: Bulletin | null }
export function currentBulletin(file: BulletinFile, now = Date.now()): Bulletin | null {
  const b = file.bulletin
  if (!b || !/^https:\/\/www\.bearvalley\.com\/post\/[\w-]+\/?$/.test(b.url)) return null
  const sinceCheck = now - Date.parse(file.checked), sincePost = now - Date.parse(b.posted)
  return sinceCheck >= -300_000 && sinceCheck <= 36 * 3600_000 && sincePost >= 0 && sincePost <= 7 * 86400_000 ? b : null
}
