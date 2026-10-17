// Values for people: labels from the template, units always shown.

import type { Encounter, FieldDef, Measurement, Overlay, Project, ReviewStatus, Survey, Template } from '@sciworks/shared'
import type { AnyRecord, RecordRow } from '../db'
import { getPath } from './review'
import { personName } from './setup'
import { shortTime } from './time'

export const UNIT_LABEL: Record<string, string> = { mm: 'mm', g: 'g', m: 'm', degC: '°C', pct: '%', h: 'h' }

export const STATUS_WORD: Record<ReviewStatus, string> = {
  received: 'Received',
  flagged: 'Flagged',
  edited: 'Edited',
  approved: 'Approved',
  rejected: 'Rejected',
}

/** Icon + word, never colour alone (handoff §1.4). Names from the kit's sprite. */
export const STATUS_ICON = {
  received: 'tray',
  flagged: 'flag',
  edited: 'pencil',
  approved: 'check-circle',
  rejected: 'cross',
} as const satisfies Record<ReviewStatus, string>

/** The four band words, the same on the phone (handoff §1.3). */
export const BAND_WORD = {
  green: 'On the line',
  amber: 'Near the line',
  red: 'Off the line',
  'outside-bbox': 'Outside the project area',
} as const
export const BAND_MARK = { green: 'on', amber: 'near', red: 'off', 'outside-bbox': 'outside' } as const

export const ID_BASIS: Record<string, string> = {
  'in-hand': 'In hand',
  visual: 'Seen only',
  'photo-later': 'ID from photo later',
  'scale-key': 'Scale key',
}

const isMeasurement = (v: unknown): v is Measurement =>
  !!v && typeof v === 'object' && 'value' in (v as object) && 'unit' in (v as object)

export function fmtNumber(n: number, digits = 2): string {
  return Number(n.toFixed(digits)).toLocaleString('en-GB')
}

export function fmtValue(v: unknown, field?: Pick<FieldDef, 'choices' | 'unit' | 'type'>, project?: Project): string {
  if (v === undefined || v === null || v === '') return '—'
  if (isMeasurement(v)) {
    const extra = [v.method, v.precision !== undefined ? `± ${v.precision} ${UNIT_LABEL[v.unit] ?? v.unit}` : ''].filter(Boolean).join(', ')
    return `${fmtNumber(v.value)} ${UNIT_LABEL[v.unit] ?? v.unit}${extra ? ` (${extra})` : ''}`
  }
  // { value, source } (distance along the transect) and similar wrapped numbers.
  if (typeof v === 'object' && !Array.isArray(v) && typeof (v as { value?: unknown }).value === 'number') {
    const w = v as { value: number; source?: string }
    return `${fmtNumber(w.value)}${field?.unit ? ` ${UNIT_LABEL[field.unit] ?? field.unit}` : ''}${w.source ? ` (${w.source === 'auto' ? 'worked out from the point' : w.source})` : ''}`
  }
  if (field?.type === 'people' && Array.isArray(v)) return v.map((p) => personName(project, String(p))).join(', ')
  if (field?.type === 'time' && typeof v === 'string') return shortTime(v)
  if (Array.isArray(v)) {
    return v.map((x) => field?.choices?.find((c) => c.code === String(x))?.label ?? String(x)).join(', ') || '—'
  }
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  if (field?.choices) {
    const c = field.choices.find((c) => c.code === String(v))
    if (c) return c.label
  }
  if (typeof v === 'number') return `${fmtNumber(v)}${field?.unit ? ` ${UNIT_LABEL[field.unit] ?? field.unit}` : ''}`
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

export function taxonName(e: Encounter, provisionalNames?: Map<string, string>): string {
  if (e.taxon.scientificName) return e.taxon.scientificName
  if (e.taxon.provisionalTaxonId) return provisionalNames?.get(e.taxon.provisionalTaxonId) ?? 'Provisional species'
  return e.taxon.unidentified ? 'Unidentified' : 'No species'
}

export function recordTitle(row: RecordRow, provisionalNames?: Map<string, string>): string {
  if (row.recordType === 'survey') {
    const s = row.data as Survey
    return `Survey · ${s.transectId}`
  }
  return taxonName(row.data as Encounter, provisionalNames)
}

export function recordSubtitle(row: RecordRow, project?: Project): string {
  if (row.recordType === 'survey') {
    const s = row.data as Survey
    return `${shortTime(s.startedAt)} · ${s.surveyorCount} surveyor${s.surveyorCount === 1 ? '' : 's'}`
  }
  const e = row.data as Encounter
  const along = e.distanceAlongM ? ` · ${fmtNumber(e.distanceAlongM.value, 0)} m along` : ''
  return `${e.transectId}${along} · ${shortTime(e.observedAt)} · ${personName(project, e.observerId)}`
}

/** Every field the template (and the team's overlay) defines for this record type, in screen order. */
export function fieldsFor(recordType: 'survey' | 'encounter', template?: Template, overlay?: Overlay): FieldDef[] {
  const core = (template?.fields ?? []).filter((f) => f.recordType === recordType)
  // A team field that has since joined the core form appears once (core wins), as on the phone.
  const added = (overlay?.addedFields ?? []).filter((f) => f.recordType === recordType && !core.some((c) => c.key === f.key))
  return [...core, ...added].sort((a, b) => a.order - b.order)
}

export function valueAt(data: AnyRecord, path: string): unknown {
  return getPath(data, path)
}

export const GROUP_LABEL: Record<string, string> = {
  start: 'Start',
  'weather-start': 'Weather at start',
  herp: 'Herp conditions',
  'weather-end': 'Weather at finish',
  notes: 'Notes',
  animal: 'Animal',
  measurements: 'Measurements',
  location: 'Location',
  scales: 'Scale counts',
  extras: 'Extras',
}

/** "Snout–vent length (SVL)" → "SVL": the short name where the label carries one. */
export function shortLabel(label: string): string {
  return label.match(/\(([A-Z]{2,5})\)/)?.[1] ?? label
}

export const fmtLatLon = (lat: number, lon: number) => `${lat.toFixed(6)}, ${lon.toFixed(6)}`
