// "Check a list of points": paste a set of points that should sit together (e.g. an aguada outline walked with
// a Garmin, one point per bend) and check each against the others with the shared checkPointSet().
// Nothing pasted is stored: the points stay on screen only.

import { checkPointSet, type PointSetPoint, type PointSetResult, type Project } from '@sciworks/shared'

export interface ParsedPoints {
  points: PointSetPoint[]
  errors: string[]
}

/** One point per line: "label, lat, lon" (commas, tabs or semicolons; the label is optional). */
export function parsePointList(text: string): ParsedPoints {
  const points: PointSetPoint[] = []
  const errors: string[] = []
  text.split(/\r?\n/).forEach((line, i) => {
    const raw = line.trim()
    if (!raw || raw.startsWith('#')) return
    const parts = raw.split(/[,\t;]+/).map((p) => p.trim()).filter(Boolean)
    const nums = parts.map((p) => Number(p))
    const lat = nums[nums.length - 2]
    const lon = nums[nums.length - 1]
    if (parts.length < 2 || !Number.isFinite(lat) || !Number.isFinite(lon)) {
      errors.push(`Line ${i + 1} ("${raw}"): expected "label, latitude, longitude" in decimal degrees.`)
      return
    }
    if (Math.abs(lat!) > 90 || Math.abs(lon!) > 180) {
      errors.push(`Line ${i + 1}: ${lat}, ${lon} is not a latitude/longitude.`)
      return
    }
    const label = parts.length > 2 ? parts.slice(0, parts.length - 2).join(' ') : String(points.length + 1)
    // Keep the numbers exactly as typed, so "did you mean?" can try swapped and mistyped digits.
    const typedRaw = `${parts[parts.length - 2]}, ${parts[parts.length - 1]}`
    points.push({ id: String(i + 1), label, lat: lat!, lon: lon!, typed: { raw: typedRaw, format: 'dd' } })
  })
  return { points, errors }
}

/**
 * Runs the shared point-set check. The demo project's box is Costa Rica, so the check uses the points' own box
 * (± 0.5°) instead: a list from anywhere (e.g. Calakmul, Mexico) can be checked.
 */
export function checkPointList(points: PointSetPoint[], project: Project, opts: { closed?: boolean } = {}): PointSetResult[] {
  if (points.length < 4) return []
  const lats = points.map((p) => p.lat)
  const lons = points.map((p) => p.lon)
  const box = { latMin: Math.min(...lats) - 0.5, latMax: Math.max(...lats) + 0.5, lonMin: Math.min(...lons) - 0.5, lonMax: Math.max(...lons) + 0.5 }
  return checkPointSet(points, { ...project, bbox: box }, { closed: opts.closed ?? true })
}
