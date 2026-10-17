// HQ → phone bundle, one per team (SHARED-CONTRACT §7.3):
// set-up (project, current form, transects, species pack, attribution, the team's overlay baseline, the satellite
// pictures that cover the team's transects) and
// feedback (a receipt for every (id, rev) received from the team, reviews, APPROVED corrections only, decisions).

import { v7 as uuidv7 } from 'uuid'
import { bundleFileName, sha256Hex, writeBundle, type CorrectionRequest, type HqBundleParts, type Receipt, type Review } from '@sciworks/shared'
import { db, type HqDb } from '../db'
import { basemapsFor, loadSetup, dataManagerOf } from './setup'
import { nowIso } from './time'

export const HQ_APP_VERSION = '0.1.0'

export interface HqBundleResult {
  bytes: Uint8Array
  fileName: string
  counts: { receipts: number; reviews: number; corrections: number; taxonDecisions: number; changeRequestDecisions: number; transects: number; basemaps: number }
}

export async function makeHqBundle(teamId: string, opts: { allTransects?: boolean } = {}, d: HqDb = db): Promise<HqBundleResult> {
  const setup = await loadSetup(d)
  if (!setup.project) throw new Error('Load the project set-up first.')
  const project = setup.project
  const createdAt = nowIso()
  const me = dataManagerOf(project)

  const revisions = await d.revisions.toArray()
  const records = await d.records.where('teamId').equals(teamId).toArray()
  const teamKeys = new Set(records.map((r) => r.key))

  // Receipts: every (id, rev) HQ holds from this team. They make the phone's "N not with HQ" counter drop.
  const receipts: Receipt[] = revisions
    .filter((v) => teamKeys.has(v.recordKey))
    .sort((a, b) => a.recordKey.localeCompare(b.recordKey) || a.rev - b.rev)
    .map((v) => ({ recordType: v.recordType, id: v.id, rev: v.rev, receivedAt: v.receivedAt }))

  // Reviews: the current status of each of the team's records.
  const reviews: Review[] = records
    .filter((r) => r.status !== 'received')
    .map((r) => ({
      recordType: r.recordType,
      id: r.id,
      rev: r.reviewedRev ?? r.rev,
      status: r.status,
      ...(r.statusNote ? { note: r.statusNote } : {}),
      by: r.statusBy ?? me.personId,
      at: r.statusAt ?? r.lastReceivedAt,
    }))

  // Only approved corrections ever leave HQ. AI drafts stay until a person approves them.
  const corrections: CorrectionRequest[] = (await d.corrections.where('teamId').equals(teamId).toArray())
    .filter((c) => c.state === 'approved' && c.approvedBy)
    .map((c) => ({
      correctionId: c.correctionId,
      recordType: c.recordType,
      recordId: c.recordId,
      rev: c.rev,
      fieldPath: c.fieldPath,
      current: c.current,
      proposed: c.proposed,
      reason: c.reason,
      source: c.source,
      approvedBy: c.approvedBy!,
      createdAt: c.createdAt,
    }))

  const teamTaxa = new Set((await d.provisionalTaxa.where('teamId').equals(teamId).toArray()).map((t) => t.provisionalTaxonId))
  const taxonDecisions = (await d.taxonDecisions.toArray()).filter((t) => teamTaxa.has(t.provisionalTaxonId))
  const teamCrs = new Set((await d.changeRequests.where('teamId').equals(teamId).toArray()).map((c) => c.changeRequestId))
  const changeRequestDecisions = (await d.changeRequestDecisions.toArray()).filter((c) => teamCrs.has(c.changeRequestId))

  const overlays = await d.overlays.where('teamId').equals(teamId).toArray()
  const overlay = overlays.sort((a, b) => b.overlayRev - a.overlayRev)[0]?.data

  const team = project.teams.find((t) => t.teamId === teamId)
  const transects =
    setup.transects && !opts.allTransects && team?.transectIds.length
      ? { ...setup.transects, features: setup.transects.features.filter((f) => team.transectIds.includes(f.properties.transectId)) }
      : setup.transects

  // Satellite pictures for the transects going in this bundle, byte for byte as HQ received them.
  const stored = await d.basemaps.toArray()
  const basemaps = basemapsFor(
    stored.map((b) => b.meta),
    transects,
  )
  const basemapFiles = Object.fromEntries(basemaps.map((b) => [b.basemapId, stored.find((s) => s.basemapId === b.basemapId)!.bytes]))

  const parts: HqBundleParts = {
    project,
    template: setup.template,
    ...(overlay ? { overlay } : {}),
    transects,
    speciesPack: setup.speciesPack,
    attribution: setup.attribution,
    receipts,
    reviews,
    corrections,
    taxonDecisions,
    changeRequestDecisions,
    ...(basemaps.length ? { basemaps, basemapFiles } : {}),
  }

  const header = {
    bundleType: 'hq' as const,
    bundleId: uuidv7(),
    createdAt,
    createdBy: { app: 'hq' as const, appVersion: HQ_APP_VERSION, personId: me.personId },
    projectId: project.projectId,
    teamId,
    coreVersion: setup.template?.coreVersion ?? 1,
    ...(overlay ? { overlayRev: overlay.overlayRev } : {}),
  }
  const bytes = writeBundle({ ...header, parts })
  const fileName = bundleFileName(header)

  // Keep a copy of everything that leaves HQ, too.
  await d.bundles.put({
    sha256: sha256Hex(bytes),
    fileName,
    direction: 'out',
    kind: 'hq',
    teamId,
    createdAt,
    firstImportedAt: createdAt,
    lastImportedAt: createdAt,
    timesImported: 0,
    bytes,
  })

  return {
    bytes,
    fileName,
    counts: {
      receipts: receipts.length,
      reviews: reviews.length,
      corrections: corrections.length,
      taxonDecisions: taxonDecisions.length,
      changeRequestDecisions: changeRequestDecisions.length,
      transects: transects?.features.length ?? 0,
      basemaps: basemaps.length,
    },
  }
}
