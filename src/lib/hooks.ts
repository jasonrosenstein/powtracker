import { useCallback, useEffect, useState } from 'react'
import type { LatLon } from './data.ts'

/**
 * State remembered in this browser across visits. Storage can be unavailable (private windows,
 * blocked site data), so every access is guarded and the app works without it.
 */
export function usePersisted<T>(key: string, initial: T | (() => T)): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(`pow:${key}`)
      if (raw != null) return JSON.parse(raw) as T
    } catch {
      /* fall through to the default */
    }
    return typeof initial === 'function' ? (initial as () => T)() : initial
  })
  const set = useCallback(
    (v: T) => {
      setValue(v)
      try {
        localStorage.setItem(`pow:${key}`, JSON.stringify(v))
      } catch {
        /* not remembered, still applied */
      }
    },
    [key],
  )
  return [value, set]
}

/** Saved mountains: ids kept in this browser. */
export function useSaved(): { saved: readonly string[]; isSaved: (id: string) => boolean; toggle: (id: string) => void } {
  const [saved, setSaved] = usePersisted<string[]>('saved', [])
  const isSaved = useCallback((id: string) => saved.includes(id), [saved])
  const toggle = useCallback((id: string) => setSaved(saved.includes(id) ? saved.filter((x) => x !== id) : [...saved, id]), [saved, setSaved])
  return { saved, isSaved, toggle }
}

export type Locating = { status: 'idle' } | { status: 'asking' } | { status: 'ready'; here: LatLon } | { status: 'failed'; message: string }

/** The viewer's position, asked for only when they choose to sort by distance. */
export function useLocation(): [Locating, () => void] {
  const [state, setState] = useState<Locating>({ status: 'idle' })
  const locate = useCallback(() => {
    if (!('geolocation' in navigator) || !window.isSecureContext) {
      setState({ status: 'failed', message: 'This browser will not share a location with this page.' })
      return
    }
    setState({ status: 'asking' })
    navigator.geolocation.getCurrentPosition(
      (pos) => setState({ status: 'ready', here: { lat: pos.coords.latitude, lon: pos.coords.longitude } }),
      (err) => setState({ status: 'failed', message: err.code === err.PERMISSION_DENIED ? 'Location access was declined.' : 'Your location could not be found.' }),
      { maximumAge: 600_000, timeout: 15_000 },
    )
  }, [])
  return [state, locate]
}

export type Async<T> = { status: 'loading' } | { status: 'ready'; data: T } | { status: 'error'; message: string }

/** Run an abortable load when `deps` change, and report where it stands. */
export function useAsync<T>(load: (signal: AbortSignal) => Promise<T>, deps: readonly unknown[]): Async<T> {
  const [state, setState] = useState<Async<T>>({ status: 'loading' })
  useEffect(() => {
    const ctl = new AbortController()
    setState({ status: 'loading' })
    load(ctl.signal).then(
      (data) => !ctl.signal.aborted && setState({ status: 'ready', data }),
      (e: unknown) => !ctl.signal.aborted && setState({ status: 'error', message: e instanceof Error ? e.message : String(e) }),
    )
    return () => ctl.abort()
    // The caller lists what the load depends on.
  }, deps)
  return state
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setMatches(mq.matches)
    mq.addEventListener('change', on)
    on()
    return () => mq.removeEventListener('change', on)
  }, [query])
  return matches
}

/** "3 hours ago", "2 days ago". */
export function fmtAgo(then: Date, now = Date.now()): string {
  const mins = Math.max(0, Math.round((now - then.getTime()) / 60_000))
  if (mins < 2) return 'just now'
  if (mins < 90) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 36) return `${hours} h ago`
  return `${Math.round(hours / 24)} days ago`
}
