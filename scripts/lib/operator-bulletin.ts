import { DOMParser } from '@xmldom/xmldom'
import type { Bulletin, BulletinFile } from '../../src/lib/operator-board.ts'

/** Use the latest dated post in Bear Valley's official RSS; a news post is not a lift status. */
export function bearBulletin(xml: string, now: number): BulletinFile {
  if (/<!DOCTYPE/i.test(xml)) throw Error('Unexpected RSS doctype')
  const doc = new DOMParser({onError:()=>{throw Error('Invalid RSS XML')}}).parseFromString(xml,'application/xml')
  if (doc.documentElement?.tagName !== 'rss' || !doc.getElementsByTagName('channel').length) throw Error('Not a resort RSS feed')
  let latest: Bulletin | null = null
  for (const item of Array.from(doc.getElementsByTagName('item'))) {
    const field = (tag: string) => (item.getElementsByTagName(tag)[0]?.textContent ?? '').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim()
    const pub = Date.parse(field('pubDate')), url = field('link'), title = field('title')
    if (!Number.isFinite(pub) || pub > now || !title || !/^https:\/\/www\.bearvalley\.com\/post\/[\w-]+\/?$/.test(url)) continue
    if (latest && Date.parse(latest.posted) >= pub) continue
    const first = field('description').match(/^.*?[.!?](?=\s|$)/)?.[0] ?? ''
    latest = {title:title.slice(0,180), excerpt:first.length <= 320 ? first : '', url, posted:new Date(pub).toISOString()}
  }
  return { checked:new Date(now).toISOString(), bulletin: latest }
}
