// W6 form control and team requests. Rules (SHARED-CONTRACT §4):
// - a field is never renamed, retyped or removed: it is hidden, and a new field gets a NEW key;
// - publishing makes core v(N+1); every earlier version is kept, so old records still show with their own form;
// - a team's own field, once accepted, joins the core form with the SAME key and path, so no record moves.

import { searchTaxa, type ChangeRequestDecision, type FieldDef, type FieldType, type TaxonDecision, type Template, type Unit } from '@sciworks/shared'
import { db, type HqDb } from '../db'
import { emptyScope, recheck } from './checks'
import { loadSetup } from './setup'
import { nowIso } from './time'

export interface TemplateDraft {
  baseVersion: number
  fields: FieldDef[]
  /** Change requests accepted into this draft; their decisions are written when it is published. */
  acceptedRequestIds: string[]
  /** Plain-words list of what this draft changes. */
  changes: string[]
}

const DRAFT_KEY = 'templateDraft'

export async function loadDraft(d: HqDb = db): Promise<TemplateDraft | undefined> {
  return (await d.setup.get(DRAFT_KEY))?.value as TemplateDraft | undefined
}

async function saveDraft(draft: TemplateDraft, d: HqDb) {
  await d.setup.put({ key: DRAFT_KEY, value: draft })
}

async function draftOrNew(d: HqDb): Promise<{ draft: TemplateDraft; template: Template }> {
  const { template } = await loadSetup(d)
  if (!template) throw new Error('Load the project set-up first.')
  const existing = await loadDraft(d)
  if (existing && existing.baseVersion === template.coreVersion) return { draft: existing, template }
  return { draft: { baseVersion: template.coreVersion, fields: structuredClone(template.fields), acceptedRequestIds: [], changes: [] }, template }
}

export async function discardDraft(d: HqDb = db) {
  await d.setup.delete(DRAFT_KEY)
}

/** Hide a field (or show it again). Its data stays on every record. */
export async function toggleHidden(key: string, d: HqDb = db) {
  const { draft } = await draftOrNew(d)
  const f = draft.fields.find((x) => x.key === key)
  if (!f) throw new Error(`No field ${key}`)
  f.hidden = !f.hidden
  draft.changes.push(`${f.hidden ? 'Hide' : 'Show'} "${f.label}"`)
  await saveDraft(draft, d)
}

/** Every key ever used, in any form version or team overlay. A new field may never reuse one. */
async function usedKeys(d: HqDb): Promise<Set<string>> {
  const keys = new Set<string>()
  for (const t of await d.templates.toArray()) for (const f of t.data.fields) keys.add(f.key)
  for (const o of await d.overlays.toArray()) for (const f of o.data.addedFields) keys.add(f.key)
  const draft = await loadDraft(d)
  for (const f of draft?.fields ?? []) keys.add(f.key)
  return keys
}

export function keyFromLabel(label: string): string {
  const words = label
    .normalize('NFKD')
    .replace(/[^\w\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  return words.map((w, i) => (i === 0 ? w.toLowerCase() : w[0]!.toUpperCase() + w.slice(1).toLowerCase())).join('')
}

export interface NewField {
  recordType: 'survey' | 'encounter'
  label: string
  key?: string
  type: Extract<FieldType, 'number' | 'text' | 'choice' | 'boolean'>
  unit?: Unit
  tier: 'core' | 'team' | 'free'
  choices?: string[]
  hidden?: boolean
  help?: string
}

/**
 * Adds a field to the next core version. New HQ fields keep their values in the record's `teamFields`
 * (the one open slot every record already has), so the phone needs no new code to store them.
 */
export async function addField(input: NewField, d: HqDb = db): Promise<FieldDef> {
  const { draft } = await draftOrNew(d)
  const label = input.label.trim()
  if (!label) throw new Error('Give the field a label.')
  const key = input.key?.trim() || keyFromLabel(label)
  if (!/^[a-z][A-Za-z0-9]*$/.test(key)) throw new Error('The key must be letters and digits, starting with a lower-case letter.')
  if ((await usedKeys(d)).has(key)) throw new Error(`The key "${key}" is already used (now or in an earlier version). Pick another: keys are never reused.`)
  const group = input.recordType === 'encounter' ? 'extras' : 'notes'
  const order = Math.max(0, ...draft.fields.filter((f) => f.recordType === input.recordType).map((f) => f.order)) + 1
  const field: FieldDef = {
    key,
    path: `teamFields.${key}`,
    recordType: input.recordType,
    label,
    ...(input.help ? { help: input.help } : {}),
    type: input.type,
    tier: input.tier,
    ...(input.unit ? { unit: input.unit } : {}),
    ...(input.type === 'choice' ? { choices: (input.choices ?? []).map((c) => ({ code: keyFromLabel(c).replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`), label: c.trim() })) } : {}),
    ...(input.hidden ? { hidden: true } : {}),
    group,
    order,
    ...(input.tier !== 'core' ? { teamCan: ['show-hide' as const] } : {}),
    origin: 'hq',
    addedInCore: draft.baseVersion + 1,
  }
  if (field.type === 'choice' && !field.choices?.length) throw new Error('A choice field needs at least one choice.')
  draft.fields.push(field)
  draft.changes.push(`Add "${label}" (${input.recordType === 'encounter' ? 'animal' : 'survey'}, ${input.type}${input.unit ? `, ${input.unit}` : ''})`)
  await saveDraft(draft, d)
  return field
}

/** Accept a team's request: its own field joins the next core form with the same key and path. */
export async function acceptChangeRequest(changeRequestId: string, d: HqDb = db) {
  const cr = await d.changeRequests.get(changeRequestId)
  if (!cr) throw new Error('No such request.')
  const { draft } = await draftOrNew(d)
  if (draft.acceptedRequestIds.includes(changeRequestId)) return
  if (cr.data.kind === 'promote-team-field' && cr.data.fieldKey) {
    const key = cr.data.fieldKey
    if (!draft.fields.some((f) => f.key === key)) {
      const overlays = (await d.overlays.where('teamId').equals(cr.teamId).toArray()).sort((a, b) => b.overlayRev - a.overlayRev)
      const def = overlays.map((o) => o.data.addedFields.find((f) => f.key === key)).find(Boolean)
      const base: FieldDef = def ?? {
        key,
        path: `teamFields.${key}`,
        recordType: 'encounter',
        label: key,
        type: 'number',
        tier: 'free',
        group: 'extras',
        order: 100,
        addedInCore: draft.baseVersion + 1,
      }
      draft.fields.push({ ...base, tier: 'team', teamCan: ['show-hide'], origin: 'hq', addedInCore: draft.baseVersion + 1 })
      draft.changes.push(`Add the ${cr.teamId} field "${base.label}" to the core form (same key, so no record changes)`)
    }
  } else {
    draft.changes.push(`Accepted request: ${cr.data.proposal}`)
  }
  draft.acceptedRequestIds.push(changeRequestId)
  await saveDraft(draft, d)
}

export async function declineChangeRequest(changeRequestId: string, by: string, note?: string, d: HqDb = db) {
  const decision: ChangeRequestDecision = { changeRequestId, decision: 'declined', ...(note ? { note } : {}), by, at: nowIso() }
  await d.changeRequestDecisions.put(decision)
}

/** Publish the draft as core v(N+1). Earlier versions stay; records are never touched. */
export async function publishDraft(by: string, d: HqDb = db): Promise<Template> {
  return d.transaction('rw', d.tables, async () => {
    const { draft, template } = await draftOrNew(d)
    if (!draft.changes.length) throw new Error('Nothing to publish: the draft has no changes.')
    const next: Template = { ...template, coreVersion: template.coreVersion + 1, publishedAt: nowIso(), publishedBy: by, fields: draft.fields }
    await d.templates.add({ coreVersion: next.coreVersion, data: next, publishedAt: next.publishedAt })
    for (const id of draft.acceptedRequestIds) {
      await d.changeRequestDecisions.put({ changeRequestId: id, decision: 'accepted', inCoreVersion: next.coreVersion, by, at: next.publishedAt })
    }
    await d.setup.delete(DRAFT_KEY)
    return next
  })
}

// ---------- provisional species ----------

/** "Did you mean …?" for a species added in the field: the top 3 pack matches. */
export async function provisionalSuggestions(proposedName: string, d: HqDb = db) {
  const { speciesPack } = await loadSetup(d)
  return speciesPack ? searchTaxa(proposedName, speciesPack.taxa, { limit: 3 }) : []
}

/** The Data Manager's decision. Records keep what was typed; the mapped name is used on export. */
export async function decideProvisional(
  input: { provisionalTaxonId: string; decision: TaxonDecision['decision']; taxonId?: string; note?: string; by: string },
  d: HqDb = db,
) {
  const decision: TaxonDecision = {
    provisionalTaxonId: input.provisionalTaxonId,
    decision: input.decision,
    ...(input.taxonId ? { taxonId: input.taxonId } : {}),
    ...(input.note ? { note: input.note } : {}),
    by: input.by,
    at: nowIso(),
  }
  await d.transaction('rw', d.tables, async () => {
    await d.taxonDecisions.put(decision)
    // Refresh the flags on animals that use this species.
    const rows = (await d.records.where('recordType').equals('encounter').toArray()).filter(
      (r) => (r.data as { taxon?: { provisionalTaxonId?: string } }).taxon?.provisionalTaxonId === input.provisionalTaxonId,
    )
    if (rows.length) {
      const scope = emptyScope()
      for (const r of rows) if (r.surveyId) scope.surveyIds.add(r.surveyId)
      await recheck(d, await loadSetup(d), scope)
    }
  })
  return decision
}
