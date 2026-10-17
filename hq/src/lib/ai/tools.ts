// The AI reviewer's tools: thin, READ-ONLY wrappers over the shared checkers (the same code the phone runs),
// plus two that only DRAFT: a correction request (waits for the Data Manager) and a note on a record.
// There is deliberately no tool that changes a record, approves, rejects or sends anything.

import {
  batchCheckTransect,
  checkCoordinate,
  checkPointSet,
  checkRanges,
  runKey,
  searchTaxa,
  type Encounter,
  type FieldDef,
  type Location,
  type Survey,
} from '@sciworks/shared'
import { v7 as uuidv7 } from 'uuid'
import type { AiRunRow, CorrectionRow, HqDb, RecordRow } from '../../db'
import { fieldsFor } from '../format'
import { getPath } from '../review'
import { transectById, type Setup } from '../setup'
import { nowIso } from '../time'

export interface ToolContext {
  d: HqDb
  setup: Setup
  runId: string
  scopeKeys: string[]
}

const round = (n: number, dp = 1) => Math.round(n * 10 ** dp) / 10 ** dp

async function recordOrThrow(ctx: ToolContext, recordKey: string): Promise<RecordRow> {
  const row = await ctx.d.records.get(recordKey)
  if (!row) throw new Error(`No record "${recordKey}". Use list_records to see the keys.`)
  return row
}

function speciesOf(row: RecordRow): string | undefined {
  if (row.recordType !== 'encounter') return undefined
  const t = (row.data as Encounter).taxon
  return t.scientificName ?? (t.provisionalTaxonId ? 'provisional species' : t.unidentified ? 'unidentified' : undefined)
}

/** A compact line per record: enough to choose what to look at closely. */
function summarise(row: RecordRow) {
  const base = {
    recordKey: row.key,
    type: row.recordType,
    teamId: row.teamId,
    transectId: row.transectId,
    date: row.date,
    rev: row.rev,
    reviewStatus: row.status,
    warnings: row.flags.filter((f) => f.level === 'warn').map((f) => f.text),
  }
  if (row.recordType === 'survey') {
    const s = row.data as Survey
    return { ...base, startedAt: s.startedAt, finishedAt: s.finishedAt, surveyors: s.surveyorCount, effortPersonHours: s.effortPersonHours }
  }
  const e = row.data as Encounter
  return {
    ...base,
    species: speciesOf(row),
    idBasis: e.taxon.idBasis,
    observedAt: e.observedAt,
    sex: e.sex,
    lifeStage: e.lifeStage,
    svlMm: e.svl?.value,
    tailMm: e.tailLength?.value,
    massG: e.mass?.value,
    distanceAlongM: e.distanceAlongM?.value,
    coordinate: { band: row.hq?.coord?.band ?? e.location.check.band, offsetM: round(row.hq?.coord?.offsetM ?? e.location.check.offsetM), fixedInField: !!e.location.original },
  }
}

// ---------- read-only tools ----------

export async function listRecords(ctx: ToolContext, input: { scope?: 'this-review' | 'all'; teamId?: string; onlyWithWarnings?: boolean }) {
  let rows = await ctx.d.records.toArray()
  if ((input.scope ?? 'this-review') === 'this-review') {
    const keys = new Set(ctx.scopeKeys)
    rows = rows.filter((r) => keys.has(r.key))
  }
  if (input.teamId) rows = rows.filter((r) => r.teamId === input.teamId)
  if (input.onlyWithWarnings) rows = rows.filter((r) => r.flagged)
  rows = rows.filter((r) => !r.voided)
  return { count: rows.length, records: rows.map(summarise) }
}

export async function getRecord(ctx: ToolContext, input: { recordKey: string }) {
  const row = await recordOrThrow(ctx, input.recordKey)
  const template = ctx.setup.templates.find((t) => t.coreVersion === row.data.coreVersion) ?? ctx.setup.template
  const labels = Object.fromEntries(fieldsFor(row.recordType, template).map((f) => [f.path, `${f.label}${f.unit ? ` (${f.unit})` : ''}`]))
  return {
    recordKey: row.key,
    reviewStatus: row.status,
    allWarningsAndNotes: row.flags.map((f) => `${f.level}: ${f.text}`),
    hqCoordinateCheck: row.hq?.coord ? { band: row.hq.coord.band, offsetM: round(row.hq.coord.offsetM), chainageM: Math.round(row.hq.coord.chainageM), toleranceM: row.hq.coord.toleranceM, flags: row.hq.coord.flags } : undefined,
    fieldLabels: labels,
    record: row.data,
  }
}

export async function checkCoordinateTool(ctx: ToolContext, input: { recordKey: string }) {
  const row = await recordOrThrow(ctx, input.recordKey)
  if (row.recordType !== 'encounter') return { error: 'Only animal records have a point to check.' }
  const e = row.data as Encounter
  const transect = transectById(ctx.setup, e.transectId)
  if (!transect || !ctx.setup.project) return { error: `Transect ${e.transectId} is not in HQ's set-up.` }
  const typed = e.location.original ? undefined : e.location.typed
  const c = checkCoordinate({ lat: e.location.lat, lon: e.location.lon, accuracyM: e.location.accuracyM, typed }, transect, ctx.setup.project)
  const phone = e.location.check
  return {
    transectId: e.transectId,
    now: { band: c.band, offsetM: round(c.offsetM), toleranceM: c.toleranceM, distanceAlongM: Math.round(c.chainageM), flags: c.flags },
    suggestions: c.suggestions.map((s) => ({ explain: s.explain, lat: s.lat, lon: s.lon, offsetM: round(s.offsetM), distanceAlongM: Math.round(s.chainageM) })),
    asTyped: e.location.typed?.raw,
    fixedInTheField: e.location.original
      ? { originalOffsetM: round(phone.offsetM), decision: phone.decision?.kind, by: phone.decision?.by, suggestionUsed: phone.suggestions.find((s) => s.kind === phone.decision?.suggestionKind)?.explain }
      : undefined,
    phoneDecision: phone.decision ? { kind: phone.decision.kind, reason: phone.decision.reason } : undefined,
  }
}

export async function checkRangesTool(ctx: ToolContext, input: { recordKey: string }) {
  const row = await recordOrThrow(ctx, input.recordKey)
  if (row.recordType !== 'encounter') return { error: 'Only animal records have measurements.' }
  const pack = ctx.setup.speciesPack
  if (!pack) return { error: 'No species pack loaded.' }
  const e = row.data as Encounter
  const taxon = e.taxon.taxonId ? pack.taxa.find((t) => t.taxonId === e.taxon.taxonId) : undefined
  return {
    species: taxon?.scientificName ?? speciesOf(row),
    measured: { svl: e.svl, tailLength: e.tailLength, mass: e.mass, tailCondition: e.tailCondition, lifeStage: e.lifeStage },
    warnings: checkRanges(e, pack),
    packRanges: taxon?.sizeRanges ?? 'This pack gives no size ranges for this species.',
    rangeSources: (taxon?.sizeSources ?? []).map((s) => ({ field: s.field, source: s.source, verbatim: s.verbatim })),
    packStatus: `${pack.status}: ${pack.disclaimer}`,
  }
}

export async function batchCheckTransectTool(ctx: ToolContext, input: { transectId: string; date: string }) {
  const transect = transectById(ctx.setup, input.transectId)
  if (!transect) return { error: `No transect ${input.transectId}.` }
  const rows = (await ctx.d.records.where('[transectId+date]').equals([input.transectId, input.date]).toArray()).filter(
    (r) => r.recordType === 'encounter' && !r.voided && r.hq?.coord,
  )
  const result = batchCheckTransect(
    rows.map((r) => ({ id: r.key, lat: (r.data as Encounter).location.lat, lon: (r.data as Encounter).location.lon, offsetM: r.hq!.coord!.offsetM })),
    transect,
  )
  return {
    points: rows.length,
    note: rows.length < 5 ? 'Fewer than 5 points on this walk, so the outlier check has too little to compare.' : undefined,
    results: result.map((x) => ({ recordKey: x.id, flags: x.flags })),
  }
}

export function checkPointSetTool(ctx: ToolContext, input: { points: { label: string; lat: number; lon: number }[]; closed?: boolean }) {
  if (!ctx.setup.project) return { error: 'No project loaded.' }
  const pts = input.points.map((p, i) => ({ id: String(i + 1), label: p.label, lat: p.lat, lon: p.lon }))
  const lats = pts.map((p) => p.lat)
  const lons = pts.map((p) => p.lon)
  const project = { ...ctx.setup.project, bbox: { latMin: Math.min(...lats) - 0.5, latMax: Math.max(...lats) + 0.5, lonMin: Math.min(...lons) - 0.5, lonMax: Math.max(...lons) + 0.5 } }
  return checkPointSet(pts, project, { closed: input.closed ?? true }).map((r) => ({
    label: r.label,
    fromCentreM: Math.round(r.fromCentreM),
    outlier: r.outlier,
    band: r.check?.band,
    offsetM: r.check ? round(r.check.offsetM) : undefined,
    suggestions: r.check?.suggestions.map((s) => s.explain),
  }))
}

export function searchTaxaTool(ctx: ToolContext, input: { query: string }) {
  const pack = ctx.setup.speciesPack
  if (!pack) return { error: 'No species pack loaded.' }
  return searchTaxa(input.query, pack.taxa, { limit: 5 }).map((m) => ({
    scientificName: m.taxon.scientificName,
    taxonId: m.taxon.taxonId,
    commonName: m.taxon.commonName,
    family: m.taxon.family,
    matchedOn: m.matched,
    reason: m.reason,
  }))
}

export async function runKeyTool(ctx: ToolContext, input: { recordKey: string }) {
  const row = await recordOrThrow(ctx, input.recordKey)
  if (row.recordType !== 'encounter') return { error: 'Only animal records have scale counts.' }
  const pack = ctx.setup.speciesPack
  if (!pack) return { error: 'No species pack loaded.' }
  const e = row.data as Encounter
  if (!e.scaleCounts || !Object.keys(e.scaleCounts).length) return { error: 'No scale counts on this record.' }
  const k = runKey({ ...e.scaleCounts, sex: e.sex, tailCondition: e.tailCondition }, pack)
  return {
    recordedSpecies: speciesOf(row),
    candidates: k.candidates.slice(0, 3).map((c) => ({ scientificName: c.scientificName, score: round(c.score, 2), matched: c.matched, conflicts: c.conflicts })),
    checkNext: k.checkNext,
  }
}

// ---------- drafting tools (never change a record) ----------

const DRAFTABLE: FieldDef['type'][] = ['measurement', 'number', 'choice', 'text', 'boolean', 'location']

/** The model sometimes sends a number as text ("435" or "435 mm"): read the number out of it. */
export function numberFrom(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v !== 'string') return undefined
  const m = v.trim().replace(/,/g, '').match(/^(-?\d+(?:\.\d+)?)\s*(?:mm|g|m|°C|degC|%|h)?$/i)
  return m ? Number(m[1]) : undefined
}

export async function draftCorrection(
  ctx: ToolContext,
  input: { recordKey: string; fieldPath: string; proposedNumber?: number; proposedValue?: number | string | boolean; proposedLat?: number; proposedLon?: number; reason: string },
) {
  const row = await recordOrThrow(ctx, input.recordKey)
  const template = ctx.setup.templates.find((t) => t.coreVersion === row.data.coreVersion) ?? ctx.setup.template
  const field = fieldsFor(row.recordType, template).find((f) => f.path === input.fieldPath)
  if (!field || !DRAFTABLE.includes(field.type)) {
    const allowed = fieldsFor(row.recordType, template).filter((f) => DRAFTABLE.includes(f.type)).map((f) => f.path)
    return { error: `"${input.fieldPath}" can't be corrected this way. Use one of: ${allowed.join(', ')}.` }
  }
  const current = getPath(row.data, field.path)
  let proposed: unknown
  if (field.type === 'location') {
    if (typeof input.proposedLat !== 'number' || typeof input.proposedLon !== 'number') return { error: 'For location, give proposedLat and proposedLon.' }
    const loc = (row.data as Encounter).location
    const transect = transectById(ctx.setup, row.transectId)
    const check = transect && ctx.setup.project ? checkCoordinate({ lat: input.proposedLat, lon: input.proposedLon, accuracyM: loc.accuracyM }, transect, ctx.setup.project) : loc.check
    proposed = { ...loc, lat: input.proposedLat, lon: input.proposedLon, original: loc.original ?? { lat: loc.lat, lon: loc.lon }, check } satisfies Location
  } else if (field.type === 'measurement') {
    const n = input.proposedNumber ?? numberFrom(input.proposedValue)
    if (n === undefined) return { error: `For a measurement, give proposedNumber as a number in ${field.unit ?? 'the field unit'} (got ${JSON.stringify(input.proposedValue)}).` }
    proposed = { ...((current as object | undefined) ?? { unit: field.unit }), value: n }
  } else if (field.type === 'number') {
    const n = input.proposedNumber ?? numberFrom(input.proposedValue)
    if (n === undefined) return { error: `Give proposedNumber as a number (got ${JSON.stringify(input.proposedValue)}).` }
    proposed = n
  } else if (field.type === 'choice') {
    const code = String(input.proposedValue)
    if (!field.choices?.some((c) => c.code === code)) return { error: `Choose one of: ${field.choices?.map((c) => c.code).join(', ')}.` }
    proposed = field.valueType === 'number' ? Number(code) : code
  } else {
    proposed = input.proposedValue
  }

  const existing = (await ctx.d.corrections.where('recordKey').equals(row.key).toArray()).find(
    (c) => c.fieldPath === field.path && c.state !== 'discarded' && JSON.stringify(c.proposed) === JSON.stringify(proposed),
  )
  if (existing) return { correctionId: existing.correctionId, status: `Already ${existing.state === 'draft' ? 'drafted, waiting for the Data Manager' : 'approved by the Data Manager'}. Nothing new created.` }

  const c: CorrectionRow = {
    correctionId: uuidv7(),
    recordKey: row.key,
    recordType: row.recordType,
    recordId: row.id,
    rev: row.rev,
    teamId: row.teamId,
    fieldPath: field.path,
    current,
    proposed,
    reason: input.reason,
    source: 'ai-agent',
    state: 'draft',
    createdAt: nowIso(),
  }
  await ctx.d.corrections.add(c)
  await ctx.d.aiRuns.where('runId').equals(ctx.runId).modify((r: AiRunRow) => void r.draftIds.push(c.correctionId))
  return { correctionId: c.correctionId, status: 'Drafted. It waits for the Data Manager to approve, edit or discard. Nothing was changed.' }
}

export async function addNote(ctx: ToolContext, input: { recordKey: string; note: string }) {
  const row = await recordOrThrow(ctx, input.recordKey)
  const dup = (await ctx.d.aiNotes.where('recordKey').equals(row.key).toArray()).find((n) => n.text === input.note && !n.dismissed)
  if (dup) return { status: 'Same note already on this record.' }
  const id = await ctx.d.aiNotes.add({ runId: ctx.runId, recordKey: row.key, text: input.note, at: nowIso() })
  await ctx.d.aiRuns.where('runId').equals(ctx.runId).modify((r: AiRunRow) => void r.noteIds.push(id as number))
  return { status: 'Note added for the Data Manager. The record is unchanged.' }
}

export async function writeSummary(ctx: ToolContext, input: { summary: string }) {
  await ctx.d.aiRuns.update(ctx.runId, { summary: input.summary })
  return { status: 'Summary saved for the Data Manager.' }
}
