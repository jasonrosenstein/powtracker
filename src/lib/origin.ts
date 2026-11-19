// Where the app is running and where its data lives. On the web the data files sit beside the
// page. The iPhone app carries a copy from the day it was built, so it reads the live site
// instead and keeps its own copy for when there is no connection.
import { Capacitor } from '@capacitor/core'

/** True inside the iPhone app. */
export const NATIVE = Capacitor.isNativePlatform()
export const SITE = 'https://powtracker.app/'
const BESIDE = `${import.meta.env.BASE_URL}data/`

/** Fetch a data file: from the live site in the app (falling back to the copy inside it), from beside the page on the web. */
export async function fetchData(file: string, init?: RequestInit): Promise<Response> {
  if (!NATIVE) return fetch(BESIDE + file, init)
  try {
    const res = await fetch(`${SITE}data/${file}`, init)
    if (res.ok) return res
  } catch {
    /* offline: use the copy the app was built with */
  }
  return fetch(BESIDE + file, init)
}

/** A link to one mountain that works for whoever it is sent to. */
export const shareUrl = (resortId: string) => (NATIVE ? `${SITE}#r=${resortId}` : location.href)
