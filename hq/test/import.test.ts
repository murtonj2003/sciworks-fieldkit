import { readFileSync } from 'node:fs'
import { unzipSync, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { readBundle, writeBundle, type Encounter } from '@sciworks/shared'
import { HqDb } from '../src/db'
import { importBundleFile, summaryLine } from '../src/lib/importBundle'
import { setStatus } from '../src/lib/review'

const fixture = (name: string) => new Uint8Array(readFileSync(new URL(`../../shared/fixtures/${name}`, import.meta.url)))
let n = 0
const freshDb = () => new HqDb(`hq-test-${Date.now()}-${n++}`)

async function withDemo() {
  const d = freshDb()
  const s = await importBundleFile(fixture('HQ_sample.zip'), 'HQ_sample.zip', d)
  expect(s.ok).toBe(true)
  return d
}

const snapshot = async (d: HqDb) => ({
  records: await d.records.toArray(),
  revisions: await d.revisions.toArray(),
  photos: (await d.photos.toArray()).map((p) => p.key),
  taxa: await d.provisionalTaxa.count(),
  crs: await d.changeRequests.count(),
  overlays: await d.overlays.count(),
  bundles: await d.bundles.count(),
})

describe('W1 · import a Field bundle (SHARED-CONTRACT §7.2)', () => {
  it('needs the set-up first, and keeps the raw file anyway', async () => {
    const d = freshDb()
    const s = await importBundleFile(fixture('FIELD_sample.zip'), 'FIELD_sample.zip', d)
    expect(s.ok).toBe(false)
    expect(await d.bundles.count()).toBe(1)
    expect(await d.records.count()).toBe(0)
  })

  it('H1: FIELD_sample.zip imports with the right counts', async () => {
    const d = await withDemo()
    const s = await importBundleFile(fixture('FIELD_sample.zip'), 'FIELD_sample.zip', d)
    expect(s.ok).toBe(true)
    expect([s.newRecords, s.updatedRecords, s.duplicates]).toEqual([4, 0, 0])
    expect(s.newPhotos).toBe(2)
    expect(s.newProvisionalTaxa).toBe(1)
    expect(s.newChangeRequests).toBe(1)
    expect(s.overlayAdopted).toBe(2)
    expect(s.badFiles).toEqual([])
    expect(summaryLine(s)).toBe('4 new, 0 updated, 0 duplicates, 2 photos.')
    expect(await d.records.where('recordType').equals('encounter').count()).toBe(3)
    expect(await d.devices.count()).toBe(1)
  })

  it('H2: importing the same file twice changes nothing', async () => {
    const d = await withDemo()
    await importBundleFile(fixture('FIELD_sample.zip'), 'FIELD_sample.zip', d)
    const before = await snapshot(d)
    const s = await importBundleFile(fixture('FIELD_sample.zip'), 'FIELD_sample.zip (again)', d)
    expect([s.newRecords, s.updatedRecords, s.duplicates, s.newPhotos]).toEqual([0, 0, 4, 0])
    expect(s.alreadyHadFile).toBe(true)
    expect(await snapshot(d)).toEqual(before)
  })

  it('W3: HQ re-runs the checks: the SVL typo is flagged, the field-fixed coordinate is 5.6 m from the line', async () => {
    const d = await withDemo()
    await importBundleFile(fixture('FIELD_sample.zip'), 'FIELD_sample.zip', d)
    const rows = await d.records.where('recordType').equals('encounter').toArray()
    const svl = rows.find((r) => (r.data as Encounter).svl?.value === 4350)!
    expect(svl.status).toBe('flagged')
    expect(svl.flags.map((f) => f.text)).toContain("SVL 4,350 mm is above this pack's maximum for Leptodeira ornata (646 mm). Check?")

    const fixed = rows.find((r) => (r.data as Encounter).location.typed?.raw === '16P 825749 1151370')!
    expect(fixed.hq?.coord?.band).toBe('green')
    expect(fixed.hq?.coord?.offsetM).toBeCloseTo(5.6, 1)
    // The phone's own check is untouched, beside HQ's.
    expect((fixed.data as Encounter).location.check.band).toBe('red')
    expect(fixed.flags.some((f) => f.code === 'FIXED_IN_FIELD')).toBe(true)
  })

  it('H3: a newer rev after approval shows as edited, and the old rev stays in history', async () => {
    const d = await withDemo()
    await importBundleFile(fixture('FIELD_sample.zip'), 'FIELD_sample.zip', d)
    const r = readBundle(fixture('FIELD_sample.zip'))
    if (!r.ok) throw new Error('fixture unreadable')
    const e = r.field!.encounters![1]!
    await setStatus(`encounter:${e.id}`, 'approved', { by: 'p-dm' }, d)

    const edited: Encounter = { ...e, rev: e.rev + 1, svl: { ...e.svl!, value: 435 } }
    const bytes = writeBundle({
      bundleType: 'field',
      bundleId: '0199f0a2-1c00-7a00-8000-0000000000ff',
      createdAt: '2026-10-17T07:00:00-06:00',
      createdBy: r.manifest.createdBy,
      projectId: 'cr-herps',
      teamId: 'team-b',
      coreVersion: 1,
      parts: { encounters: [edited] },
    })
    const s = await importBundleFile(bytes, 'FIELD_edit.zip', d)
    expect([s.newRecords, s.updatedRecords, s.editedAfterReview]).toEqual([0, 1, 1])
    const row = await d.records.get(`encounter:${e.id}`)
    expect(row?.status).toBe('edited')
    expect(row?.reviewedRev).toBe(e.rev)
    expect(row?.rev).toBe(e.rev + 1)
    expect(await d.revisions.where('recordKey').equals(`encounter:${e.id}`).count()).toBe(2)
  })

  it('H6: a damaged photo is named, and everything else imports', async () => {
    const d = await withDemo()
    const files = unzipSync(fixture('FIELD_sample.zip'))
    const photoPath = Object.keys(files).find((p) => p.endsWith('.jpg'))!
    files[photoPath] = files[photoPath]!.map((b, i) => (i === 20 ? b ^ 0xff : b))
    const s = await importBundleFile(zipSync(files), 'FIELD_damaged.zip', d)
    expect(s.ok).toBe(true)
    expect(s.newRecords).toBe(4)
    expect(s.newPhotos).toBe(1)
    expect(s.badFiles.map((b) => b.path)).toEqual([photoPath])
    expect(summaryLine(s)).toContain(`1 bad file: ${photoPath}`)
  })

  it('an animal saved before its location is held aside (counted, kept once), not dropped', async () => {
    const d = await withDemo()
    const r = readBundle(fixture('FIELD_sample.zip'))
    if (!r.ok) throw new Error('fixture unreadable')
    const { location: _drop, ...incomplete } = { ...r.field!.encounters![0]!, id: '0199f0a2-1c00-7a00-8000-0000000009aa', rev: 1 }
    void _drop
    const make = (bundleId: string) =>
      writeBundle({
        bundleType: 'field',
        bundleId,
        createdAt: '2026-10-17T07:00:00-06:00',
        createdBy: r.manifest.createdBy,
        projectId: 'cr-herps',
        teamId: 'team-b',
        coreVersion: 1,
        parts: { encounters: [incomplete as unknown as Encounter] },
      })
    const s1 = await importBundleFile(make('0199f0a2-1c00-7a00-8000-0000000000a1'), 'a.zip', d)
    expect(s1.heldAside).toBe(1)
    expect(summaryLine(s1)).toContain('1 incomplete item held aside')
    await importBundleFile(make('0199f0a2-1c00-7a00-8000-0000000000a2'), 'b.zip', d)
    expect(await d.quarantine.count()).toBe(1)
    expect(await d.records.count()).toBe(0)
  })

  it('an unreadable file is kept, not lost', async () => {
    const d = await withDemo()
    const s = await importBundleFile(new Uint8Array([1, 2, 3]), 'notes.txt', d)
    expect(s.ok).toBe(false)
    expect((await d.bundles.toArray()).some((b) => b.kind === 'unreadable')).toBe(true)
  })
})
