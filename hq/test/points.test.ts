// Synthetic outline only (La Selva demo area). Susie's real points are private and never go in the repo.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { readBundle, type Project } from '@sciworks/shared'
import { checkPointList, parsePointList } from '../src/lib/pointList'

const hq = readBundle(new Uint8Array(readFileSync(new URL('../../shared/fixtures/HQ_sample.zip', import.meta.url))))
const project = (hq.ok ? hq.hq?.project : undefined) as Project

// Eight bends of a ~150 m pond outline; point S's latitude was typed with two digits swapped (10.430200 → 10.403200).
const text = `# label, lat, lon
N, 10.432600, -84.004000
NE, 10.432100, -84.003000
E, 10.431200, -84.002600
SE, 10.430300, -84.003000
S, 10.403200, -84.004000
SW, 10.430300, -84.005000
W, 10.431200, -84.005400
NW, 10.432100, -84.005000`

describe('Check a list of points', () => {
  it('parses label, lat, lon lines and reports bad ones', () => {
    const r = parsePointList(`${text}\nbroken line`)
    expect(r.points).toHaveLength(8)
    expect(r.points[0]).toMatchObject({ label: 'N', lat: 10.4326, lon: -84.004 })
    expect(r.errors).toHaveLength(1)
  })

  it('finds the slipped point, about 3 km out, and offers the swap that puts it back on the outline', () => {
    const results = checkPointList(parsePointList(text).points, project, { closed: true })
    const s = results.find((x) => x.label === 'S')!
    expect(s.outlier).toBe(true)
    expect(s.check?.band).toBe('red')
    expect(s.fromCentreM).toBeGreaterThan(2500)
    expect(s.check?.suggestions[0]?.explain).toMatch(/swap/i)
    for (const ok of results.filter((x) => x.label !== 'S')) expect(ok.check?.band ?? 'green').not.toBe('red')
  })
})
