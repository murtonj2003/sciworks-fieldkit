// Importing a bundle (SHARED-CONTRACT §7.2). This is where data is won or lost, so:
// - the raw file is always kept, even if it can't be read;
// - records merge on (recordType, id, rev): already seen → skip; higher rev → current; lower → history;
// - importing the same file twice changes nothing (handshake H2);
// - one bad file never stops the rest.

import { readBundle, sha256Hex, type Survey } from '@sciworks/shared'
import { db, recordKey, revisionKey, type AnyRecord, type HqDb, type ImportSummary, type RawBundleRow, type RecordRow } from '../db'
import { emptyScope, recheck } from './checks'
import { applySetup, loadSetup } from './setup'
import { nowIso } from './time'

const emptySummary = (fileName: string): ImportSummary => ({
  fileName,
  ok: true,
  alreadyHadFile: false,
  newRecords: 0,
  updatedRecords: 0,
  duplicates: 0,
  olderRevs: 0,
  editedAfterReview: 0,
  newPhotos: 0,
  newProvisionalTaxa: 0,
  newChangeRequests: 0,
  newCorrectionResponses: 0,
  heldAside: 0,
  badFiles: [],
})

/** Keeps the raw file. Same bytes → same row (the count of imports goes up, nothing else changes). */
async function keepRaw(d: HqDb, sha: string, fileName: string, bytes: Uint8Array, extra: Partial<RawBundleRow>) {
  const now = nowIso()
  const existing = await d.bundles.get(sha)
  if (existing) {
    await d.bundles.update(sha, { lastImportedAt: now, timesImported: existing.timesImported + 1 })
    return true
  }
  await d.bundles.add({
    sha256: sha,
    fileName,
    direction: 'in',
    kind: 'unreadable',
    firstImportedAt: now,
    lastImportedAt: now,
    timesImported: 1,
    bytes,
    ...extra,
  })
  return false
}

export async function importBundleFile(bytes: Uint8Array, fileName: string, d: HqDb = db): Promise<ImportSummary> {
  const summary = emptySummary(fileName)
  const sha = sha256Hex(bytes)
  const r = readBundle(bytes)

  if (!r.ok) {
    await d.transaction('rw', d.bundles, () => keepRaw(d, sha, fileName, bytes, { kind: 'unreadable', error: r.error }))
    return { ...summary, ok: false, error: `${r.error} The file is kept in HQ's backup.` }
  }

  const m = r.manifest
  summary.kind = m.bundleType
  summary.teamId = m.teamId
  summary.badFiles = r.problems.map((p) => ({ path: p.path, message: p.message }))

  // ---- An HQ bundle: set-up only (the demo project ships as one). Its feedback was written by an HQ. ----
  if (m.bundleType === 'hq') {
    return d.transaction('rw', d.tables, async () => {
      const current = await loadSetup(d)
      if (current.project && r.hq?.project && current.project.projectId !== r.hq.project.projectId) {
        summary.ok = false
        summary.error = `This set-up is for project "${r.hq.project.projectId}", but HQ holds "${current.project.projectId}". Nothing was changed.`
        summary.alreadyHadFile = await keepRaw(d, sha, fileName, bytes, { kind: 'hq', manifest: m, teamId: m.teamId, createdAt: m.createdAt, summary })
        return summary
      }
      const hq = r.hq ?? {}
      summary.setupApplied = await applySetup(
        { project: hq.project, template: hq.template, transects: hq.transects, speciesPack: hq.speciesPack, attribution: hq.attribution },
        d,
      )
      summary.alreadyHadFile = await keepRaw(d, sha, fileName, bytes, { kind: 'hq', manifest: m, teamId: m.teamId, createdAt: m.createdAt, summary })
      // New set-up (a transect, a species pack) can change every check, so re-run them all.
      const all = await d.records.toArray()
      const scope = emptyScope()
      for (const row of all) {
        scope.recordKeys.add(row.key)
        if (row.surveyId) scope.surveyIds.add(row.surveyId)
        if (row.recordType === 'encounter') scope.transectDays.add(`${row.transectId}|${row.date}`)
      }
      if (all.length) await recheck(d, await loadSetup(d), scope)
      return summary
    })
  }

  // ---- A Field bundle ----
  return d.transaction('rw', d.tables, async () => {
    const setup = await loadSetup(d)
    const rawExtra = { kind: 'field' as const, manifest: m, teamId: m.teamId, deviceId: m.createdBy.deviceId, createdAt: m.createdAt }
    if (!setup.project) {
      summary.ok = false
      summary.error = 'Load the project set-up first (Load demo project). The file is kept and can be re-imported.'
      summary.alreadyHadFile = await keepRaw(d, sha, fileName, bytes, { ...rawExtra, summary })
      return summary
    }
    if (m.projectId !== setup.project.projectId) {
      summary.ok = false
      summary.error = `This bundle is for project "${m.projectId}", but HQ holds "${setup.project.projectId}". Nothing was imported; the file is kept.`
      summary.alreadyHadFile = await keepRaw(d, sha, fileName, bytes, { ...rawExtra, summary })
      return summary
    }

    const hadFileBefore = !!(await d.bundles.get(sha))
    const now = nowIso()
    const f = r.field ?? {}
    const scope = emptyScope()
    let newRevs = 0

    const surveyDates = new Map<string, string>()
    for (const s of f.surveys ?? []) surveyDates.set(s.id, s.date)
    const dateOf = async (rec: AnyRecord): Promise<string> => {
      if (rec.recordType === 'survey') return rec.date
      const known = surveyDates.get(rec.surveyId) ?? ((await d.records.get(recordKey('survey', rec.surveyId)))?.data as Survey | undefined)?.date
      return known ?? rec.observedAt.slice(0, 10)
    }

    const incoming: AnyRecord[] = [...(f.surveys ?? []), ...(f.encounters ?? [])]
    for (const rec of incoming) {
      const rk = recordKey(rec.recordType, rec.id)
      const vk = revisionKey(rec.recordType, rec.id, rec.rev)
      if (await d.revisions.get(vk)) {
        summary.duplicates++
        continue
      }
      await d.revisions.add({ key: vk, recordKey: rk, recordType: rec.recordType, id: rec.id, rev: rec.rev, data: rec, receivedAt: now, bundleSha: sha })
      newRevs++

      const current = await d.records.get(rk)
      if (current && rec.rev < current.rev) {
        summary.olderRevs++
        continue
      }
      const date = await dateOf(rec)
      const base = {
        key: rk,
        recordType: rec.recordType,
        id: rec.id,
        rev: rec.rev,
        teamId: rec.teamId,
        transectId: rec.transectId,
        surveyId: rec.recordType === 'encounter' ? rec.surveyId : rec.id,
        date,
        data: rec,
        voided: rec.status === 'void',
        lastReceivedAt: now,
      }
      if (!current) {
        const row: RecordRow = { ...base, status: 'received', flags: [], flagged: 0, firstReceivedAt: now }
        await d.records.add(row)
        summary.newRecords++
      } else {
        const reviewed = current.status === 'approved' || current.status === 'rejected' || current.status === 'edited'
        if (reviewed) summary.editedAfterReview++
        await d.records.put({
          ...current,
          ...base,
          status: reviewed ? 'edited' : current.status,
          firstReceivedAt: current.firstReceivedAt,
        })
        summary.updatedRecords++
        if (current.date !== date || current.transectId !== rec.transectId) scope.transectDays.add(`${current.transectId}|${current.date}`)
      }
      scope.recordKeys.add(rk)
      scope.surveyIds.add(base.surveyId)
      if (rec.recordType === 'encounter') scope.transectDays.add(`${rec.transectId}|${date}`)
    }

    // Photos: keyed on photoId, skipped if already held with the same SHA-256.
    for (const p of f.photos ?? []) {
      const key = `${p.photoId}:${p.sha256}`
      const fileBytes = f.photoFiles?.[p.photoId]
      if (!fileBytes || (await d.photos.get(key))) continue
      await d.photos.add({ key, photoId: p.photoId, recordId: p.recordId, sha256: p.sha256, meta: p, bytes: fileBytes, bundleSha: sha })
      summary.newPhotos++
    }

    for (const t of f.provisionalTaxa ?? []) {
      if (await d.provisionalTaxa.get(t.provisionalTaxonId)) continue
      await d.provisionalTaxa.add({ provisionalTaxonId: t.provisionalTaxonId, teamId: t.teamId, data: t, receivedAt: now })
      summary.newProvisionalTaxa++
    }
    for (const c of f.changeRequests ?? []) {
      if (await d.changeRequests.get(c.changeRequestId)) continue
      await d.changeRequests.add({ changeRequestId: c.changeRequestId, teamId: c.teamId, data: c, receivedAt: now })
      summary.newChangeRequests++
    }
    for (const c of f.correctionResponses ?? []) {
      if (await d.correctionResponses.get(c.correctionId)) continue
      await d.correctionResponses.add({ correctionId: c.correctionId, data: c, receivedAt: now })
      summary.newCorrectionResponses++
    }

    // Overlay: keep every one; the highest overlayRev per team is the baseline sent back.
    if (f.overlay) {
      const key = `${f.overlay.teamId}:${f.overlay.overlayRev}`
      if (!(await d.overlays.get(key))) {
        const best = await d.overlays.where('teamId').equals(f.overlay.teamId).toArray()
        await d.overlays.add({ key, teamId: f.overlay.teamId, overlayRev: f.overlay.overlayRev, data: f.overlay, receivedAt: now })
        if (!best.some((o) => o.overlayRev > f.overlay!.overlayRev)) summary.overlayAdopted = f.overlay.overlayRev
      }
    }

    // Items that failed validation (e.g. an animal saved before its location) are kept aside, never thrown away.
    // Held once per (file path, id, rev), so a phone re-sending the same incomplete record adds nothing.
    for (const x of r.rejected) {
      const v = (x.value ?? {}) as { id?: unknown; rev?: unknown; recordType?: unknown }
      const itemKey = v.id !== undefined ? `${x.path}:${String(v.id)}:${String(v.rev ?? '')}` : `${sha}:${x.path}:${x.index ?? ''}`
      summary.heldAside++
      if (await d.quarantine.where('itemKey').equals(itemKey).first()) continue
      const recordType = x.path === 'records/surveys.json' ? 'survey' : x.path === 'records/encounters.json' ? 'encounter' : undefined
      await d.quarantine.add({ itemKey, recordKey: recordType && v.id ? recordKey(recordType, String(v.id)) : undefined, bundleSha: sha, path: x.path, index: x.index, value: x.value })
    }

    // Device panel.
    const deviceId = m.createdBy.deviceId
    if (deviceId) {
      const dev = await d.devices.get(deviceId)
      const later = !dev || m.createdAt > dev.lastBundleAt
      await d.devices.put({
        deviceId,
        teamId: m.teamId,
        personId: later ? m.createdBy.personId : dev?.personId,
        appVersion: later ? m.createdBy.appVersion : dev?.appVersion,
        lastBundleAt: later ? m.createdAt : dev!.lastBundleAt,
        lastImportedAt: now,
        bundles: (dev?.bundles ?? 0) + (hadFileBefore ? 0 : 1),
        revsReceived: (dev?.revsReceived ?? 0) + newRevs,
      })
    }

    if (scope.recordKeys.size) await recheck(d, setup, scope)

    summary.alreadyHadFile = await keepRaw(d, sha, fileName, bytes, { ...rawExtra, summary })
    return summary
  })
}

/** One line, in plain words: "3 new, 1 updated, 0 duplicates, 1 bad file: photos/x.jpg". */
export function summaryLine(s: ImportSummary): string {
  if (!s.ok) return s.error ?? 'Could not import.'
  if (s.kind === 'hq') return s.setupApplied?.length ? `Set-up loaded: ${s.setupApplied.join(', ')}.` : 'Set-up already loaded. Nothing changed.'
  const parts = [`${s.newRecords} new`, `${s.updatedRecords} updated`, `${s.duplicates} duplicate${s.duplicates === 1 ? '' : 's'}`]
  if (s.olderRevs) parts.push(`${s.olderRevs} older version${s.olderRevs === 1 ? '' : 's'} kept as history`)
  if (s.newPhotos) parts.push(`${s.newPhotos} photo${s.newPhotos === 1 ? '' : 's'}`)
  if (s.heldAside) parts.push(`${s.heldAside} incomplete item${s.heldAside === 1 ? '' : 's'} held aside`)
  const bad = s.badFiles.length ? `, ${s.badFiles.length} bad file${s.badFiles.length === 1 ? '' : 's'}: ${s.badFiles.map((b) => b.path).join(', ')}` : ''
  const edited = s.editedAfterReview ? ` ${s.editedAfterReview} changed after review: shown as Edited.` : ''
  return `${parts.join(', ')}${bad}.${edited}`
}

