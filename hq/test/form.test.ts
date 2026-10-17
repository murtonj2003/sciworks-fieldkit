import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { readBundle } from '@sciworks/shared'
import { HqDb } from '../src/db'
import { makeHqBundle } from '../src/lib/hqBundle'
import { importBundleFile } from '../src/lib/importBundle'
import {
  acceptChangeRequest,
  addField,
  declineChangeRequest,
  decideProvisional,
  keyFromLabel,
  loadDraft,
  provisionalSuggestions,
  publishDraft,
  toggleHidden,
} from '../src/lib/formAdmin'
import { loadSetup } from '../src/lib/setup'

const fixture = (name: string) => new Uint8Array(readFileSync(new URL(`../../shared/fixtures/${name}`, import.meta.url)))
let n = 0
async function loaded() {
  const d = new HqDb(`hq-form-${Date.now()}-${n++}`)
  await importBundleFile(fixture('HQ_sample.zip'), 'HQ_sample.zip', d)
  await importBundleFile(fixture('FIELD_sample.zip'), 'FIELD_sample.zip', d)
  return d
}

describe('W6 · form control', () => {
  it('keys come from labels and are never reused', async () => {
    expect(keyFromLabel('Number of individuals')).toBe('numberOfIndividuals')
    const d = await loaded()
    await expect(addField({ recordType: 'encounter', label: 'SVL again', key: 'svl', type: 'number', tier: 'core' }, d)).rejects.toThrow('already used')
    await expect(addField({ recordType: 'encounter', label: 'Perch', key: 'perchHeightM', type: 'number', tier: 'core' }, d)).rejects.toThrow('already used')
  })

  it("H5 (HQ side): accept Team B's field + add one + hide one → publish core v2; v1 kept; records untouched; the HQ bundle carries v2", async () => {
    const d = await loaded()
    const before = await d.records.toArray()
    const cr = (await d.changeRequests.toArray())[0]!
    await acceptChangeRequest(cr.changeRequestId, d)
    await addField({ recordType: 'encounter', label: 'Number of individuals', type: 'number', tier: 'core' }, d)
    await toggleHidden('extras.gravid', d)
    const draft = (await loadDraft(d))!
    expect(draft.changes.length).toBeGreaterThanOrEqual(2)

    const v2 = await publishDraft('p-dm', d)
    expect(v2.coreVersion).toBe(2)
    const perch = v2.fields.find((f) => f.key === 'perchHeightM')!
    expect(perch).toMatchObject({ path: 'teamFields.perchHeightM', origin: 'hq', addedInCore: 2 })
    expect(v2.fields.find((f) => f.key === 'numberOfIndividuals')).toMatchObject({ path: 'teamFields.numberOfIndividuals', type: 'number', addedInCore: 2 })
    expect(v2.fields.length).toBe(47)

    const setup = await loadSetup(d)
    expect(setup.templates.map((t) => t.coreVersion)).toEqual([1, 2])
    expect(await d.records.toArray()).toEqual(before)
    expect(await loadDraft(d)).toBeUndefined()
    expect(await d.changeRequestDecisions.get(cr.changeRequestId)).toMatchObject({ decision: 'accepted', inCoreVersion: 2 })

    const out = await makeHqBundle('team-b', {}, d)
    expect(out.fileName).toContain('_core2_')
    const r = readBundle(out.bytes)
    if (!r.ok) throw new Error(r.error)
    expect(r.problems).toEqual([])
    expect(r.hq?.template?.coreVersion).toBe(2)
    expect(r.hq?.changeRequestDecisions?.[0]).toMatchObject({ decision: 'accepted', inCoreVersion: 2 })
  })

  it('publishing with no changes is refused; a decline is recorded at once', async () => {
    const d = await loaded()
    await expect(publishDraft('p-dm', d)).rejects.toThrow('Nothing to publish')
    const cr = (await d.changeRequests.toArray())[0]!
    await declineChangeRequest(cr.changeRequestId, 'p-dm', 'Not this season', d)
    expect(await d.changeRequestDecisions.get(cr.changeRequestId)).toMatchObject({ decision: 'declined', note: 'Not this season' })
  })
})

describe('Provisional species: "Did you mean …?"', () => {
  it('suggests pack names for a misspelled field name, and a mapping goes back to the team', async () => {
    const d = await loaded()
    const top = await provisionalSuggestions('leptodira', d)
    expect(top[0]?.taxon.scientificName).toBe('Leptodeira ornata')
    expect(top.length).toBeLessThanOrEqual(3)

    const p = (await d.provisionalTaxa.toArray())[0]!
    const sugg = await provisionalSuggestions(p.data.proposedName, d)
    await decideProvisional({ provisionalTaxonId: p.provisionalTaxonId, decision: 'mapped', taxonId: sugg[0]?.taxon.taxonId ?? 'gbif:1', by: 'p-dm' }, d)
    const out = await makeHqBundle('team-b', {}, d)
    const r = readBundle(out.bytes)
    if (!r.ok) throw new Error(r.error)
    expect(r.hq?.taxonDecisions?.[0]).toMatchObject({ provisionalTaxonId: p.provisionalTaxonId, decision: 'mapped' })
  })
})
