// Review actions. A person makes every decision; each one is logged with who and when (append-only).

import { v7 as uuidv7 } from 'uuid'
import type { ReviewStatus } from '@sciworks/shared'
import { db, type AnyRecord, type CorrectionRow, type HqDb } from '../db'
import { nowIso } from './time'

/** Approve, reject, or put back to the queue. Applies to the record's current rev. */
export async function setStatus(key: string, status: Extract<ReviewStatus, 'approved' | 'rejected' | 'received'>, who: { by: string; note?: string }, d: HqDb = db) {
  return d.transaction('rw', d.records, d.reviewLog, async () => {
    const row = await d.records.get(key)
    if (!row) throw new Error(`No record ${key}`)
    const at = nowIso()
    const finalStatus: ReviewStatus = status === 'received' ? (row.flagged ? 'flagged' : 'received') : status
    await d.records.update(key, {
      status: finalStatus,
      reviewedRev: status === 'received' ? undefined : row.rev,
      statusBy: who.by,
      statusAt: at,
      statusNote: who.note,
    })
    await d.reviewLog.add({ recordKey: key, recordType: row.recordType, id: row.id, rev: row.rev, status: finalStatus, note: who.note, by: who.by, at })
  })
}

/** Reads a value by a dotted path: 'svl.value', 'location', 'teamFields.perchHeightM'. */
export function getPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), obj)
}

/** A Data Manager's own correction request. They wrote it, so it is approved by them at once. */
export async function createCorrection(
  input: { key: string; fieldPath: string; proposed: unknown; reason: string; by: string; source?: CorrectionRow['source']; asDraft?: boolean },
  d: HqDb = db,
): Promise<CorrectionRow> {
  const row = await d.records.get(input.key)
  if (!row) throw new Error(`No record ${input.key}`)
  const now = nowIso()
  const draft = input.asDraft ?? false
  const c: CorrectionRow = {
    correctionId: uuidv7(),
    recordKey: row.key,
    recordType: row.recordType,
    recordId: row.id,
    rev: row.rev,
    teamId: row.teamId,
    fieldPath: input.fieldPath,
    current: getPath(row.data, input.fieldPath),
    proposed: input.proposed,
    reason: input.reason,
    source: input.source ?? 'data-manager',
    state: draft ? 'draft' : 'approved',
    createdAt: now,
    ...(draft ? {} : { approvedBy: input.by, approvedAt: now }),
  }
  await d.corrections.add(c)
  return c
}

/** The Data Manager approves an AI draft, optionally after editing what it proposes or why. */
export async function approveDraft(correctionId: string, by: string, edits: { proposed?: unknown; reason?: string } = {}, d: HqDb = db) {
  const c = await d.corrections.get(correctionId)
  if (!c || c.state !== 'draft') return
  await d.corrections.update(correctionId, {
    state: 'approved',
    approvedBy: by,
    approvedAt: nowIso(),
    ...(edits.proposed !== undefined ? { proposed: edits.proposed } : {}),
    ...(edits.reason !== undefined ? { reason: edits.reason } : {}),
  })
}

/** Discarded drafts are kept (state 'discarded'), never deleted. */
export async function discardDraft(correctionId: string, d: HqDb = db) {
  await d.corrections.update(correctionId, { state: 'discarded' })
}

export interface DiffLine {
  path: string
  before: unknown
  after: unknown
}

const IGNORE = new Set(['rev', 'updatedAt'])

/** Field-by-field differences between two revs of a record. */
export function diffRecords(a: AnyRecord | undefined, b: AnyRecord, prefix = ''): DiffLine[] {
  const out: DiffLine[] = []
  const walk = (x: unknown, y: unknown, path: string) => {
    if (JSON.stringify(x) === JSON.stringify(y)) return
    const isObj = (v: unknown) => v !== null && typeof v === 'object' && !Array.isArray(v)
    if (isObj(x) && isObj(y)) {
      const keys = new Set([...Object.keys(x as object), ...Object.keys(y as object)])
      for (const k of keys) {
        if (!path && IGNORE.has(k)) continue
        walk((x as Record<string, unknown>)[k], (y as Record<string, unknown>)[k], path ? `${path}.${k}` : k)
      }
      return
    }
    out.push({ path, before: x, after: y })
  }
  walk(a, b, prefix)
  return out
}
