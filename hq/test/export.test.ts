import { readFileSync } from 'node:fs'
import { strFromU8, unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { readBundle, type Encounter } from '@sciworks/shared'
import { HqDb } from '../src/db'
import { buildDwcArchive } from '../src/lib/dwc'
import { makeHqBundle } from '../src/lib/hqBundle'
import { importBundleFile } from '../src/lib/importBundle'
import { createCorrection, setStatus } from '../src/lib/review'
import { loadSetup } from '../src/lib/setup'

const fixture = (name: string) => new Uint8Array(readFileSync(new URL(`../../shared/fixtures/${name}`, import.meta.url)))
let n = 0
async function loaded() {
  const d = new HqDb(`hq-export-${Date.now()}-${n++}`)
  await importBundleFile(fixture('HQ_sample.zip'), 'HQ_sample.zip', d)
  await importBundleFile(fixture('FIELD_sample.zip'), 'FIELD_sample.zip', d)
  return d
}
async function dwc(d: HqDb) {
  const s = await loadSetup(d)
  return buildDwcArchive({
    records: await d.records.toArray(),
    project: s.project!,
    template: s.template,
    templates: s.templates,
    transects: s.transects,
    speciesPack: s.speciesPack,
    attribution: s.attribution,
    provisionalTaxa: (await d.provisionalTaxa.toArray()).map((p) => p.data),
    taxonDecisions: await d.taxonDecisions.toArray(),
    corrections: await d.corrections.toArray(),
    answeredCorrectionIds: new Set((await d.correctionResponses.toArray()).map((a) => a.correctionId)),
    createdAt: '2026-10-17T08:00:00-06:00',
  })
}
const rows = (csv: string) => csv.trim().split('\r\n')

describe('W4 · Darwin Core export', () => {
  it('nothing approved → empty CSVs (headers only)', async () => {
    const d = await loaded()
    const r = await dwc(d)
    expect([r.events, r.occurrences, r.measurements]).toEqual([0, 0, 0])
    expect(r.skipped).toHaveLength(4)
  })

  it('only approved records, and only when their survey is approved', async () => {
    const d = await loaded()
    const enc = await d.records.where('recordType').equals('encounter').toArray()
    const fixed = enc.find((r) => (r.data as Encounter).location.original)!
    await setStatus(fixed.key, 'approved', { by: 'p-dm' }, d)
    let r = await dwc(d)
    expect(r.occurrences).toBe(0)
    expect(r.skipped.find((s) => s.key === fixed.key)?.why).toBe('approved, but its survey is not approved yet')

    const survey = (await d.records.where('recordType').equals('survey').first())!
    await setStatus(survey.key, 'approved', { by: 'p-dm' }, d)
    r = await dwc(d)
    expect([r.events, r.occurrences]).toEqual([1, 1])
    const occ = rows(r.csv.occurrence)
    expect(occ).toHaveLength(2)
    expect(occ[1]).toContain(fixed.id)
    expect(occ[1]).toContain('HumanObservation')
    expect(occ[1]).toContain('Imantodes cenchoa')
    expect(occ[1]).toContain('Male')
    // The audit trail travels with the record.
    expect(occ[1]).toContain('typed ""16P 825749 1151370""')
    expect(occ[1]).toContain('Swap the 4th and 5th digits of the northing')
    // Unapproved animals are absent.
    for (const other of enc.filter((e) => e.key !== fixed.key)) expect(r.csv.occurrence).not.toContain(other.id)

    const ev = rows(r.csv.event)
    expect(ev[1]).toContain('person-hours')
    expect(ev[1]).toContain('7.25')
    expect(ev[1]).toContain('Squamata')
    expect(ev[1]).toContain('LINESTRING')

    const mof = rows(r.csv.mof)
    expect(mof.some((l) => l.includes('snout-vent length') && l.includes(',640,mm,'))).toBe(true)

    const zip = unzipSync(r.zip)
    expect(Object.keys(zip).sort()).toEqual(['Event.csv', 'MeasurementOrFact.csv', 'Occurrence.csv', 'attribution.md', 'eml.xml', 'meta.xml'])
    expect(strFromU8(zip['meta.xml']!)).toContain('rowType="http://rs.tdwg.org/dwc/terms/Event"')
  })

  it('an approved record that changed on the phone afterwards is held back', async () => {
    const d = await loaded()
    const all = await d.records.toArray()
    for (const r of all) await setStatus(r.key, 'approved', { by: 'p-dm' }, d)
    const one = all.find((r) => r.recordType === 'encounter')!
    await d.records.update(one.key, { status: 'edited', rev: one.rev + 1 })
    const r = await dwc(d)
    expect(r.occurrences).toBe(2)
    expect(r.skipped.find((s) => s.key === one.key)?.why).toBe('changed since it was approved')
  })

  it('a record with a correction waiting on the surveyor is held back until they answer', async () => {
    const d = await loaded()
    for (const r of await d.records.toArray()) await setStatus(r.key, 'approved', { by: 'p-dm' }, d)
    const svl = (await d.records.toArray()).find((r) => (r.data as Encounter).svl?.value === 4350)!
    const c = await createCorrection({ key: svl.key, fieldPath: 'svl', proposed: { value: 435, unit: 'mm' }, reason: 'zero added?', by: 'p-dm' }, d)
    let r = await dwc(d)
    expect(r.occurrences).toBe(2)
    expect(r.skipped.find((s) => s.key === svl.key)?.why).toContain('waiting for the surveyor')
    await d.correctionResponses.add({ correctionId: c.correctionId, data: { correctionId: c.correctionId, decision: 'declined', by: 'p-b-2', at: '2026-10-17T09:00:00-06:00' }, receivedAt: '2026-10-17T09:30:00-06:00' })
    r = await dwc(d)
    expect(r.occurrences).toBe(3)
  })
})

describe('W5 · HQ bundle for a team', () => {
  it('carries set-up, a receipt per rev, reviews and ONLY approved corrections; the phone side can read it', async () => {
    const d = await loaded()
    const enc = await d.records.where('recordType').equals('encounter').toArray()
    const svl = enc.find((r) => (r.data as Encounter).svl?.value === 4350)!
    await setStatus(enc[0]!.key, 'approved', { by: 'p-dm' }, d)
    const draft = await createCorrection({ key: svl.key, fieldPath: 'svl', proposed: { value: 435, unit: 'mm' }, reason: 'zero added?', by: 'p-dm', source: 'ai-agent', asDraft: true }, d)
    await createCorrection({ key: svl.key, fieldPath: 'sex', proposed: 'male', reason: 'test', by: 'p-dm' }, d)

    const out = await makeHqBundle('team-b', {}, d)
    expect(out.fileName).toMatch(/^HQ_cr-herps_team-b_core1_\d{8}-\d{4}\.zip$/)
    const r = readBundle(out.bytes)
    expect(r.ok && r.problems).toEqual([])
    if (!r.ok) return
    expect(r.manifest.bundleType).toBe('hq')
    expect(r.hq?.receipts).toHaveLength(4)
    expect(r.hq?.reviews?.some((v) => v.status === 'approved' && v.id === enc[0]!.id)).toBe(true)
    expect(r.hq?.corrections?.map((c) => c.fieldPath)).toEqual(['sex'])
    expect(r.hq?.corrections?.some((c) => c.correctionId === draft.correctionId)).toBe(false)
    expect(r.hq?.transects?.features.map((f) => f.properties.transectId)).toEqual(['T-LS-02'])
    expect(r.hq?.overlay?.overlayRev).toBe(2)
    expect(r.hq?.template?.coreVersion).toBe(1)
    expect(await d.bundles.where('direction').equals('out').count()).toBe(1)
  })
})
