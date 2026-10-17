// Species photos: HQ keeps them from the set-up bundle (so they show offline) and passes them on in every team bundle.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { readBundle, sha256Hex } from '@sciworks/shared'
import { HqDb } from '../src/db'
import { makeHqBundle } from '../src/lib/hqBundle'
import { importBundleFile, summaryLine } from '../src/lib/importBundle'

const fixture = (name: string) => new Uint8Array(readFileSync(new URL(`../../shared/fixtures/${name}`, import.meta.url)))
let n = 0
const freshDb = () => new HqDb(`hq-photos-${Date.now()}-${n++}`)

const sample = readBundle(fixture('HQ_sample.zip'))
if (!sample.ok) throw new Error(sample.error)
const samplePhotos = sample.hq!.speciesPhotos!
const shaOf = Object.fromEntries(samplePhotos.map((p) => [p.taxonId, p.sha256]))

describe('species photos (contract change Sat 21:15)', () => {
  it('importing the sample set-up stores every photo with its credit', async () => {
    const d = freshDb()
    const s = await importBundleFile(fixture('HQ_sample.zip'), 'HQ_sample.zip', d)
    expect(samplePhotos.length).toBeGreaterThan(0)
    expect(summaryLine(s)).toContain(`${samplePhotos.length} species photos`)
    const rows = await d.speciesPhotos.toArray()
    expect(rows).toHaveLength(samplePhotos.length)
    for (const r of rows) {
      expect(sha256Hex(r.bytes)).toBe(shaOf[r.taxonId])
      expect(r.meta.credit).toMatch(/CC/)
    }
    // Leptodeira ornata, the demo's flagged animal, has its photo.
    expect(await d.speciesPhotos.get('gbif:9265052')).toBeDefined()

    // The same set-up again changes nothing.
    const again = await importBundleFile(fixture('HQ_sample.zip'), 'HQ_sample.zip (again)', d)
    expect(summaryLine(again)).not.toContain('species photo')
    expect(await d.speciesPhotos.count()).toBe(samplePhotos.length)
  })

  it("every team's HQ bundle carries the photos with the same sha256", async () => {
    const d = freshDb()
    await importBundleFile(fixture('HQ_sample.zip'), 'HQ_sample.zip', d)
    for (const teamId of ['team-a', 'team-b']) {
      const out = await makeHqBundle(teamId, {}, d)
      expect(out.counts.speciesPhotos).toBe(samplePhotos.length)
      const r = readBundle(out.bytes)
      if (!r.ok) throw new Error(r.error)
      expect(r.problems).toEqual([])
      expect(r.hq!.speciesPhotos).toHaveLength(samplePhotos.length)
      for (const p of r.hq!.speciesPhotos!) {
        expect(p.sha256).toBe(shaOf[p.taxonId])
        expect(sha256Hex(r.hq!.speciesPhotoFiles![p.taxonId]!)).toBe(shaOf[p.taxonId])
      }
    }
  })
})
