import { describe, expect, it } from 'vitest'
import { METRICS, SORTS } from './data.ts'
import { LEVELS } from './models.ts'
import { allowedLevel, allowedMetric, allowedSort, FEATURE_PITCH, FREE_SAVED, levelNeeds, metricNeeds, passesNeed, savingNeeds, sortNeeds } from './plan.ts'

describe('the free plan', () => {
  it('shows the next 3 days and the last 24 hours, and nothing further out', () => {
    expect(METRICS.filter((m) => !metricNeeds('free', m.id)).map((m) => m.id)).toEqual(['p24', 'w3'])
    expect(metricNeeds('free', 'w7')).toBe('outlook')
    expect(metricNeeds('free', 'w14')).toBe('outlook')
    expect(metricNeeds('free', 'p72')).toBe('outlook')
  })
  it('forecasts at mid elevation only', () => {
    expect(LEVELS.filter((l) => !levelNeeds('free', l))).toEqual(['mid'])
    expect(levelNeeds('free', 'top')).toBe('levels')
  })
  it('keeps every sort except by depth and by model agreement', () => {
    expect(SORTS.filter((s) => sortNeeds('free', s.id)).map((s) => s.id)).toEqual(['depth', 'agree'])
    expect(sortNeeds('free', 'depth')).toBe('depth')
    expect(sortNeeds('free', 'agree')).toBe('models')
  })
  it('has no pass filter, and one saved mountain', () => {
    expect(passesNeed('free', [])).toBeNull()
    expect(passesNeed('free', ['ikon'])).toBe('passes')
    expect(savingNeeds('free', FREE_SAVED - 1)).toBeNull()
    expect(savingNeeds('free', FREE_SAVED)).toBe('saved')
  })
  it('falls back to what it allows when a remembered choice is not', () => {
    expect(allowedMetric('free', 'w14')).toBe('w3')
    expect(allowedMetric('free', 'p24')).toBe('p24')
    expect(allowedLevel('free', 'base')).toBe('mid')
    expect(allowedSort('free', { key: 'depth', desc: false })).toEqual({ key: 'snow', desc: true })
    expect(allowedSort('free', { key: 'vert', desc: false })).toEqual({ key: 'vert', desc: false })
  })
})

describe('Pro', () => {
  it('unlocks every period, level, sort, pass and saved mountain', () => {
    expect(METRICS.every((m) => !metricNeeds('pro', m.id))).toBe(true)
    expect(LEVELS.every((l) => !levelNeeds('pro', l))).toBe(true)
    expect(SORTS.every((s) => !sortNeeds('pro', s.id))).toBe(true)
    expect(passesNeed('pro', ['ikon', 'epic'])).toBeNull()
    expect(savingNeeds('pro', 500)).toBeNull()
    expect(allowedMetric('pro', 'w14')).toBe('w14')
  })
})

describe('the paywall', () => {
  it('has something to say for every locked feature', () => {
    for (const pitch of Object.values(FEATURE_PITCH)) {
      expect(pitch.title.length).toBeGreaterThan(8)
      expect(pitch.body.endsWith('.')).toBe(true)
    }
  })
})
