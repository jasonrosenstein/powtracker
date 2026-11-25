import { describe, expect, it } from 'vitest'
import { flowPeriod, flowSeeds } from './wind-flow.ts'

const resort = [10.9,46.9,11.1,47.1] as const

describe('forecast streaks', () => {
  it('moves faster for stronger wind without an unbounded animation rate', () => {
    expect(flowPeriod(45)).toBeLessThan(flowPeriod(12))
    expect(flowPeriod(150)).toBe(flowPeriod(140))
  })
  it('keeps the same map anchors and phases after panning at the same zoom', () => {
    const a = flowSeeds(resort,[10.98,46.98,11.02,47.02],12)
    const b = flowSeeds(resort,[11,46.98,11.04,47.02],12)
    const common = a.filter(s=>s.at[0]>=11)
    expect(common.length).toBeGreaterThan(1)
    common.forEach(seed=>expect(b).toContainEqual(seed))
  })
  it('fills a zoomed-in trail view, stays within resort bounds, and caps marker count', () => {
    const zoomed = flowSeeds(resort,[10.993,46.996,11.007,47.004],14)
    expect(zoomed.length).toBeGreaterThan(5)
    const wide = flowSeeds(resort,[0,40,14,55],18)
    expect(wide.length).toBeGreaterThan(0)
    expect(wide.length).toBeLessThanOrEqual(80)
    for (const {at:[x,y],phase} of wide) {
      expect(x>=resort[0] && x<=resort[2] && y>=resort[1] && y<=resort[3]).toBe(true)
      expect(phase>=0 && phase<1).toBe(true)
    }
    expect(flowSeeds(resort,[0,0,1,1],14)).toEqual([])
  })
})
