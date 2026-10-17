// HQ re-runs the shared checks on import (SHARED-CONTRACT §7.2 step 8). Same code as the phone, so HQ sees
// exactly what the phone saw. HQ's results are stored BESIDE the phone's (record.hq), never over location.check.

import { batchCheckTransect, checkCoordinate, checkRanges, type Encounter } from '@sciworks/shared'
import type { HqDb, RecordRow } from '../db'
import { flagsFor, hasWarning } from './flags'
import { transectById, type Setup } from './setup'
import { nowIso } from './time'

export interface RecheckScope {
  surveyIds: Set<string>
  /** 'T-LS-02|2026-10-16' */
  transectDays: Set<string>
  /** Records whose own rev changed (surveys included). */
  recordKeys: Set<string>
}

export const emptyScope = (): RecheckScope => ({ surveyIds: new Set(), transectDays: new Set(), recordKeys: new Set() })

/** Runs inside the caller's transaction. Touches only HQ's own fields on the record rows. */
export async function recheck(d: HqDb, setup: Setup, scope: RecheckScope): Promise<void> {
  const checkedAt = nowIso()
  const touched = new Map<string, RecordRow>()
  const get = async (key: string) => touched.get(key) ?? (await d.records.get(key))

  // 1. Per walk (survey), in walking order, so the one-way order check can see the animal before.
  for (const surveyId of scope.surveyIds) {
    const rows = (await d.records.where('surveyId').equals(surveyId).toArray()).filter((r) => r.recordType === 'encounter')
    rows.sort((a, b) => (a.data as Encounter).observedAt.localeCompare((b.data as Encounter).observedAt))
    let previousChainageM: number | undefined
    for (const row of rows) {
      const e = row.data as Encounter
      const transect = transectById(setup, e.transectId)
      const ranges = setup.speciesPack ? checkRanges(e, setup.speciesPack) : []
      if (!transect || !setup.project) {
        row.hq = { rev: row.rev, checkedAt, ranges, batchFlags: row.hq?.batchFlags ?? [], transectMissing: !transect }
      } else {
        // The typed string only describes lat/lon if no "did you mean?" fix replaced them.
        const typed = e.location.original ? undefined : e.location.typed
        const coord = checkCoordinate(
          {
            lat: e.location.lat,
            lon: e.location.lon,
            accuracyM: e.location.accuracyM,
            typed,
            typedDistanceM: e.distanceAlongM?.source === 'typed' ? e.distanceAlongM.value : undefined,
            previousChainageM,
          },
          transect,
          setup.project,
        )
        row.hq = { rev: row.rev, checkedAt, coord, ranges, batchFlags: row.hq?.batchFlags ?? [] }
        if (coord.band === 'green' || coord.band === 'amber') previousChainageM = coord.chainageM
      }
      touched.set(row.key, row)
    }
  }

  // 2. Per transect per day: robust outlier and shared-shift (datum) hints across every team's points.
  for (const td of scope.transectDays) {
    const [transectId, date] = td.split('|') as [string, string]
    const transect = transectById(setup, transectId)
    const rows = await d.records.where('[transectId+date]').equals([transectId, date]).toArray()
    const enc = rows.filter((r) => r.recordType === 'encounter' && !r.voided).map((r) => touched.get(r.key) ?? r)
    const withCoord = enc.filter((r) => r.hq?.coord && r.hq.coord.band !== 'outside-bbox')
    const results = transect
      ? batchCheckTransect(
          withCoord.map((r) => ({ id: r.key, lat: (r.data as Encounter).location.lat, lon: (r.data as Encounter).location.lon, offsetM: r.hq!.coord!.offsetM })),
          transect,
        )
      : []
    const byKey = new Map(results.map((x) => [x.id, x.flags]))
    for (const r of enc) {
      if (r.hq) r.hq.batchFlags = byKey.get(r.key) ?? []
      touched.set(r.key, r)
    }
  }

  // 3. Surveys whose rev changed.
  for (const key of scope.recordKeys) {
    const row = await get(key)
    if (row && row.recordType === 'survey') {
      row.hq = { rev: row.rev, checkedAt, ranges: [], batchFlags: [] }
      touched.set(key, row)
    }
  }

  // 4. Flags in plain words, and the review status they imply.
  const decided = new Set((await d.taxonDecisions.toArray()).map((t) => t.provisionalTaxonId))
  for (const row of touched.values()) {
    const provisionalId = row.recordType === 'encounter' ? (row.data as Encounter).taxon.provisionalTaxonId : undefined
    row.flags = flagsFor(row.data, row.hq, { provisionalPending: provisionalId ? !decided.has(provisionalId) : undefined })
    row.flagged = hasWarning(row.flags) ? 1 : 0
    if (row.status === 'received' || row.status === 'flagged') row.status = row.flagged ? 'flagged' : 'received'
    await d.records.put(row)
  }
}
