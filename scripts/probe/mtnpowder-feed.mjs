// Probe: the shape of one resort's live feed (snow report, lifts, trails, parking, roads).
// Usage: node scripts/probe/mtnpowder-feed.mjs [resortId]
const id = process.argv[2] ?? '5'
const j = await (await fetch(`https://www.mtnpowder.com/feed?resortId=${id}`)).json()
const show = (v, n = 900) => JSON.stringify(v, null, 0).slice(0, n)
console.log(j.Name, '|', j.OperatingStatus, '|', j.LastUpdate)
const sr = { ...j.SnowReport }
for (const k of Object.keys(sr)) if (typeof sr[k] === 'string' && sr[k].length > 80) sr[k] = sr[k].slice(0, 80) + '…'
console.log('\nSnowReport keys:', Object.keys(sr).join(', '))
console.log('BaseArea:', show(sr.BaseArea, 700))
console.log('MidMountainArea:', show(sr.MidMountainArea, 500))
console.log('totals:', show(Object.fromEntries(Object.entries(sr).filter(([k]) => /Total|Open|Season|Storm|Groom|Park|Acres|Trails|Lifts/i.test(k))), 900))
console.log('\nAreas:', j.MountainAreas.map((a) => `${a.Name} (${a.Lifts?.length ?? 0} lifts, ${a.Trails?.length ?? 0} trails)`).join(' | '))
const lifts = j.MountainAreas.flatMap((a) => a.Lifts ?? [])
const trails = j.MountainAreas.flatMap((a) => a.Trails ?? [])
const tally = (rows, key) => Object.entries(rows.reduce((m, r) => ((m[r[key]] = (m[r[key]] ?? 0) + 1), m), {})).map(([k, v]) => `${k}:${v}`).join(' ')
console.log('lift statuses:', tally(lifts, 'Status'), '| types:', tally(lifts, 'LiftType'))
console.log('trail statuses:', tally(trails, 'Status'), '| difficulty:', tally(trails, 'Difficulty'), '| icons:', tally(trails, 'TrailIcon'), '| grooming:', tally(trails, 'Grooming'))
console.log('open lift:', show(lifts.find((l) => /open/i.test(l.Status)), 700))
console.log('open trail:', show(trails.find((t) => /open/i.test(t.Status)), 600))
console.log('\nCurrentConditions:', show(j.CurrentConditions, 700))
console.log('ParkingLots:', show(j.ParkingLots, 500))
console.log('Roads:', show(j.Roads, 400))
