// The satellite picture: HQ keeps it from the set-up bundle and passes it on, byte for byte, in each team's bundle.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { readBundle, sha256Hex } from '@sciworks/shared'
import { HqDb } from '../src/db'
import { makeHqBundle } from '../src/lib/hqBundle'
import { importBundleFile, summaryLine } from '../src/lib/importBundle'

const fixture = (name: string) => new Uint8Array(readFileSync(new URL(`../../shared/fixtures/${name}`, import.meta.url)))
let n = 0
const freshDb = () => new HqDb(`hq-basemap-${Date.now()}-${n++}`)

const sample = readBundle(fixture('HQ_sample.zip'))
if (!sample.ok) throw new Error(sample.error)
const sampleMap = sample.hq!.basemaps![0]!

describe('satellite picture (contract change Sat 16:50)', () => {
  it('importing the sample set-up stores the picture and its credit', async () => {
    const d = freshDb()
    const s = await importBundleFile(fixture('HQ_sample.zip'), 'HQ_sample.zip', d)
    expect(s.ok).toBe(true)
    expect(summaryLine(s)).toContain('1 satellite picture')
    const rows = await d.basemaps.toArray()
    expect(rows).toHaveLength(1)
    const [b] = rows
    expect(b!.basemapId).toBe('la-selva-s2-2021')
    expect(b!.meta.attribution).toContain('Copernicus Sentinel')
    expect(b!.meta.bounds).toEqual(sampleMap.bounds)
    expect(sha256Hex(b!.bytes)).toBe(sampleMap.sha256)
    expect([b!.bytes[0], b!.bytes[1]]).toEqual([0xff, 0xd8]) // a JPEG

    // The same set-up again changes nothing.
    const again = await importBundleFile(fixture('HQ_sample.zip'), 'HQ_sample.zip (again)', d)
    expect(summaryLine(again)).not.toContain('satellite')
    expect(await d.basemaps.count()).toBe(1)
  })

  it("a team's HQ bundle carries the picture with the same sha256", async () => {
    const d = freshDb()
    await importBundleFile(fixture('HQ_sample.zip'), 'HQ_sample.zip', d)
    const out = await makeHqBundle('team-b', {}, d)
    expect(out.counts.basemaps).toBe(1)
    const r = readBundle(out.bytes)
    if (!r.ok) throw new Error(r.error)
    expect(r.problems).toEqual([])
    const [b] = r.hq!.basemaps!
    expect(b).toMatchObject({ basemapId: 'la-selva-s2-2021', sha256: sampleMap.sha256, attribution: sampleMap.attribution })
    expect(sha256Hex(r.hq!.basemapFiles![b!.basemapId]!)).toBe(sampleMap.sha256)
  })

  it("leaves out a picture that covers none of the team's transects", async () => {
    const d = freshDb()
    await importBundleFile(fixture('HQ_sample.zip'), 'HQ_sample.zip', d)
    const elsewhere = { ...sampleMap, basemapId: 'elsewhere', transectIds: ['T-XX-01'], bounds: { latMin: 18.4, latMax: 18.5, lonMin: -89.9, lonMax: -89.8 } }
    const real = (await d.basemaps.get('la-selva-s2-2021'))!
    await d.basemaps.put({ basemapId: 'elsewhere', meta: elsewhere, bytes: real.bytes, receivedAt: real.receivedAt })
    const out = await makeHqBundle('team-b', {}, d)
    const r = readBundle(out.bytes)
    if (!r.ok) throw new Error(r.error)
    expect(r.hq!.basemaps!.map((b) => b.basemapId)).toEqual(['la-selva-s2-2021'])
  })
})
