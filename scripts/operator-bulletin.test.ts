import { describe, expect, it } from 'vitest'
import { bearBulletin } from './lib/operator-bulletin.ts'
import { currentBulletin } from '../src/lib/operator-board.ts'
const now = Date.parse('2026-11-24T12:00Z')
const item = (date: string, title: string, link='https://www.bearvalley.com/post/update') => `<item><title><![CDATA[${title}]]></title><link>${link}</link><description>Friday through Sunday. More details.</description><pubDate>${date}</pubDate></item>`
const rss = (...items: string[]) => `<rss><channel>${items.join('')}</channel></rss>`
describe('official operator bulletins',()=>{
  it('uses the newest dated operator post, not the crawl time or an off-site URL',()=>{
    const file = bearBulletin(rss(item('2026-11-22','Weekend reopening'),item('2026-11-16','Original opening'),item('2026-11-23','Offsite','https://example.org/post/not-the-resort'),item('2026-11-28','Future')),now)
    expect(currentBulletin(file,now)).toMatchObject({title:'Weekend reopening',excerpt:'Friday through Sunday.',posted:'2026-11-22T00:00:00.000Z'})
    expect(currentBulletin(file,now+37*3600_000)).toBeNull()
    expect(currentBulletin({...file,checked:new Date(now+8*86400_000).toISOString()},now+8*86400_000)).toBeNull()
  })
  it('does not promote a broken feed, an undated post or missing updates into a live status',()=>{
    expect(()=>bearBulletin('<html/>',now)).toThrow()
    expect(()=>bearBulletin('<!DOCTYPE rss><rss/>',now)).toThrow()
    expect(bearBulletin(rss(item('invalid','Open')),now).bulletin).toBeNull()
  })
})
