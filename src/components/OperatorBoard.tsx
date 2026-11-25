import { useEffect, useState } from 'react'
import { onVisibleInterval, useAsync } from '../lib/hooks.ts'
import { BEAR_BOARD, BEAR_STATUS_PAGE, currentBulletin, STATUS_POLL_MS, type BulletinFile } from '../lib/operator-board.ts'
import { fetchData } from '../lib/origin.ts'

export function BearValleyBoard() {
  const [revision, reload] = useState(0)
  useEffect(() => onVisibleInterval(() => reload(n => n+1), STATUS_POLL_MS), [])
  const news = useAsync(async signal => {
    const res = await fetchData('bear-valley-bulletin.json', {signal, cache:'no-cache'})
    if (!res.ok) throw Error('No bulletin')
    return await res.json() as BulletinFile
  }, [], STATUS_POLL_MS)
  const bulletin = news.status === 'ready' ? currentBulletin(news.data) : null
  return <section className="chart-card operator-board" aria-label="Bear Valley operating status">
    <header><h3>Live lifts and trails</h3><p>Bear Valley’s own board, loaded when you open the mountain and reloaded every five minutes while this tab is active. The update time on the board is the operator’s.</p></header>
    {bulletin && <div className="notice"><b>Resort bulletin · {new Date(bulletin.posted).toLocaleDateString('en-US',{month:'short',day:'numeric', timeZone:'America/Los_Angeles'})}</b><br/><a href={bulletin.url} target="_blank" rel="noreferrer">{bulletin.title}</a>{bulletin.excerpt && <p>{bulletin.excerpt}</p>}</div>}
    <iframe key={revision} title="Bear Valley live lift and trail status" src={BEAR_BOARD} referrerPolicy="no-referrer" sandbox="allow-scripts allow-same-origin" />
    <div className="links"><button type="button" className="link-btn" onClick={()=>reload(n=>n+1)}>Reload board</button> <a href={BEAR_STATUS_PAGE} target="_blank" rel="noreferrer">View on Bear Valley’s site</a></div>
  </section>
}
