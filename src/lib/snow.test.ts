import { describe, expect, it } from 'vitest'
import { meanSeries, modelSpread, quantile, snowCm, snowFraction, snowLiquidRatio, snowSeries, tempAt, windowSum } from './snow.ts'

describe('tempAt', () => {
  it('cools 6.5 °C per km of climb and warms on the way down', () => {
    expect(tempAt(0, 2000, 3000)).toBeCloseTo(-6.5)
    expect(tempAt(0, 2000, 1000)).toBeCloseTo(6.5)
    expect(tempAt(-4, 2000, 2000)).toBe(-4)
  })
})

describe('snowFraction', () => {
  it('is all snow at freezing and below, all rain from +2 °C', () => {
    expect(snowFraction(-10)).toBe(1)
    expect(snowFraction(0)).toBe(1)
    expect(snowFraction(2)).toBe(0)
    expect(snowFraction(8)).toBe(0)
  })
  it('splits evenly at +1 °C', () => {
    expect(snowFraction(1)).toBeCloseTo(0.5)
  })
})

describe('snowLiquidRatio', () => {
  it('hits its anchors and interpolates between them', () => {
    expect(snowLiquidRatio(0)).toBe(8)
    expect(snowLiquidRatio(-2)).toBe(10)
    expect(snowLiquidRatio(-1)).toBeCloseTo(9)
    expect(snowLiquidRatio(-15)).toBe(17)
  })
  it('peaks in the dendritic growth zone and is flat past both ends', () => {
    expect(snowLiquidRatio(-15)).toBeGreaterThan(snowLiquidRatio(-5))
    expect(snowLiquidRatio(-15)).toBeGreaterThan(snowLiquidRatio(-28))
    expect(snowLiquidRatio(-50)).toBe(12)
    expect(snowLiquidRatio(5)).toBe(5)
  })
})

describe('snowCm', () => {
  it('gives no snow without precipitation or in warm air', () => {
    expect(snowCm(0, -5)).toBe(0)
    expect(snowCm(10, 3)).toBe(0)
  })
  it('turns 10 mm of water at -2 °C into 10 cm of snow', () => {
    expect(snowCm(10, -2)).toBeCloseTo(10)
  })
  it('gives deeper snow from the same water when colder', () => {
    expect(snowCm(10, -10)).toBeGreaterThan(snowCm(10, -1))
  })
})

describe('snowSeries', () => {
  it('snows at the summit while it rains at the base', () => {
    // 5 mm an hour at +3 °C measured at 1500 m.
    const precip = [5, 5]
    const temp = [3, 3]
    const base = snowSeries(precip, temp, 1500, 1500)
    const top = snowSeries(precip, temp, 1500, 2700) // 7.8 °C colder: -4.8 °C
    expect(base).toEqual([0, 0])
    expect(top[0]).toBeGreaterThan(5)
  })
  it('keeps hours the model does not cover as null', () => {
    expect(snowSeries([1, null, 1], [-3, -3, null], 1000, 1000)).toEqual([expect.any(Number), null, null])
  })
})

describe('windowSum', () => {
  it('sums the window from its start', () => {
    expect(windowSum([1, 2, 3, 4, 5], 1, 3)).toBe(9)
  })
  it('is null when the model stops short of the window', () => {
    const series = [...new Array(50).fill(1), ...new Array(50).fill(null)]
    expect(windowSum(series, 0, 100)).toBeNull()
    expect(windowSum(series, 0, 50)).toBe(50)
  })
  it('tolerates a few missing hours', () => {
    const series: (number | null)[] = new Array(100).fill(1)
    series[10] = null
    series[60] = null
    expect(windowSum(series, 0, 100)).toBe(98)
  })
  it('is null when the series ends before the window does', () => {
    expect(windowSum([1, 1, 1], 0, 100)).toBeNull()
  })
})

describe('meanSeries', () => {
  it('averages, hour by hour, the models that have a value', () => {
    expect(meanSeries([[10, 20, null], [30, null, null], [20, 40]])).toEqual([20, 30, null])
  })
  it('is empty for no models', () => {
    expect(meanSeries([])).toEqual([])
  })
})

describe('quantile', () => {
  it('interpolates between neighbours', () => {
    expect(quantile([10, 20, 30, 40], 0.5)).toBe(25)
    expect(quantile([40, 10, 30, 20], 0.25)).toBe(17.5)
    expect(quantile([5], 0.75)).toBe(5)
  })
})

describe('modelSpread', () => {
  it('is 0 when models match and grows as they spread', () => {
    expect(modelSpread([20, 20, 20, 20], 20)).toBe(0)
    expect(modelSpread([18, 20, 22, 20], 20)!).toBeLessThan(modelSpread([5, 20, 50, 25], 25)!)
  })
  it('is not decided by one wild model', () => {
    const calm = modelSpread([40, 45, 50, 55, 60], 50)!
    const withOutlier = modelSpread([40, 45, 50, 55, 600], 158)!
    expect(withOutlier).toBeLessThanOrEqual(calm)
  })
  it('does not punish models that differ by a dusting', () => {
    expect(modelSpread([0, 1, 2], 1)!).toBeLessThan(0.3)
  })
  it('skips models that stop short, and needs three to judge', () => {
    expect(modelSpread([10, null, 30, 20, null], 20)).toBe(0.5)
    expect(modelSpread([10, 30, null], 20)).toBeNull()
    expect(modelSpread([10, 20, 30], null)).toBeNull()
  })
})
