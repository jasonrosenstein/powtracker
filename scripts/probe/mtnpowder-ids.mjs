// Probe: which resorts the mtnpowder feed serves, by id, and how many lifts and trails each lists.
// Usage: node scripts/probe/mtnpowder-ids.mjs [maxId]
const max = Number(process.argv[2] ?? 150)
const out = []
for (let id = 1; id <= max; id++) {
  try {
    const r = await fetch(`https://www.mtnpowder.com/feed?resortId=${id}`, { signal: AbortSignal.timeout(20_000), headers: { 'user-agent': 'snow-tracker-probe' } })
    if (!r.ok) continue
    const j = JSON.parse(await r.text())
    if (!j.Name) continue
    const areas = j.MountainAreas ?? []
    const lifts = areas.reduce((n, a) => n + (a.Lifts?.length ?? 0), 0)
    const trails = areas.reduce((n, a) => n + (a.Trails?.length ?? 0), 0)
    out.push({ id, name: j.Name, status: j.OperatingStatus, lifts, trails, updated: j.LastUpdate?.slice(0, 10) })
    console.log(String(id).padStart(3), j.Name.padEnd(34), String(j.OperatingStatus).padEnd(10), `lifts ${lifts}`.padEnd(9), `trails ${trails}`.padEnd(11), j.LastUpdate?.slice(0, 16))
  } catch {
    /* no feed at this id */
  }
}
console.log(`\n${out.length} resorts`)
