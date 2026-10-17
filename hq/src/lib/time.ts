// HQ timestamps carry the site's UTC offset, like every record (SHARED-CONTRACT §1).

import { toIsoWithOffset } from '@sciworks/shared'

/** Minutes east of UTC for a time zone at a given moment ('America/Costa_Rica' → -360). */
export function offsetMinutesFor(timeZone: string, at: Date = new Date()): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(at)
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value)
    const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
    return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60000)
  } catch {
    return -at.getTimezoneOffset()
  }
}

let siteTimeZone = 'America/Costa_Rica'
export function setSiteTimeZone(tz: string) {
  siteTimeZone = tz
}

/** Now, as ISO 8601 with the site's offset: '2026-10-17T19:42:10-06:00'. */
export function nowIso(at: Date = new Date()): string {
  return toIsoWithOffset(at, offsetMinutesFor(siteTimeZone, at))
}

/** 'Fri 16 Oct, 19:12' from an ISO time, shown in the time it was recorded (site-local). */
export function shortTime(iso?: string): string {
  if (!iso) return ''
  const d = iso.slice(0, 10)
  const t = iso.slice(11, 16)
  const date = new Date(`${d}T12:00:00Z`)
  const day = date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
  return `${day}, ${t}`
}

export function daysBetween(fromIso: string, to: Date = new Date()): number {
  return Math.floor((to.getTime() - new Date(fromIso).getTime()) / 86400000)
}
