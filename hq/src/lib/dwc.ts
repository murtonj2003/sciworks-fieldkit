// Darwin Core export: APPROVED records only. Survey → Event (with Humboldt effort terms), animal → Occurrence,
// each measurement and scale count → MeasurementOrFact. Mapping: herp-measurement-standards.md §4 and
// HQ-WEB-BRIEF §7. Originals are never altered.

import { strToU8, zipSync } from 'fflate'
import { FORMAT_LABELS, type Encounter, type FieldDef, type Project, type ProvisionalTaxon, type SpeciesPack, type Survey, type TaxonDecision, type Template, type TransectCollection } from '@sciworks/shared'
import type { RecordRow } from '../db'
import { personName } from './setup'

export interface DwcInput {
  records: RecordRow[]
  project: Project
  template?: Template
  templates?: Template[]
  transects?: TransectCollection
  speciesPack?: SpeciesPack
  attribution?: string
  provisionalTaxa?: ProvisionalTaxon[]
  taxonDecisions?: TaxonDecision[]
  /** Approved correction requests, and the surveyors' answers: a record with an unanswered one is held back. */
  corrections?: { correctionId: string; recordKey: string; rev: number; state: string }[]
  answeredCorrectionIds?: Set<string>
  createdAt: string
}

export interface DwcResult {
  zip: Uint8Array
  fileName: string
  events: number
  occurrences: number
  measurements: number
  skipped: { key: string; why: string }[]
  csv: { event: string; occurrence: string; mof: string }
}

// ---------- CSV ----------

const cell = (v: unknown): string => {
  if (v === undefined || v === null) return ''
  const s = typeof v === 'number' ? String(v) : String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
export function toCsv(columns: string[], rows: Record<string, unknown>[]): string {
  return [columns.join(','), ...rows.map((r) => columns.map((c) => cell(r[c])).join(','))].join('\r\n') + '\r\n'
}

// ---------- vocabularies (GBIF) ----------

/** GBIF has no "unknown" sex: Indeterminate = tried and couldn't; blank = not assessed. */
const SEX: Record<Encounter['sex'], string> = { male: 'Male', female: 'Female', indeterminate: 'Indeterminate', 'not-assessed': '' }
/** GBIF has no Metamorph, and its Hatchling is defined for birds: both export as Juvenile. */
const LIFE_STAGE: Record<Encounter['lifeStage'], string> = {
  hatchling: 'Juvenile',
  juvenile: 'Juvenile',
  subadult: 'Subadult',
  adult: 'Adult',
  tadpole: 'Tadpole',
  metamorph: 'Juvenile',
  unknown: '',
}

const CLOUD: Record<string, string> = { clear: 'clear', scattered: 'scattered cloud', broken: 'broken cloud', overcast: 'overcast', 'cannot-assess': "cloud can't be seen (canopy)" }
const RAIN: Record<string, string> = { none: 'no rain', mist: 'mist', drizzle: 'drizzle', rain: 'rain', heavy: 'heavy rain' }

function weatherLine(s: Survey): string {
  const block = (label: string, w?: Survey['weatherStart']) =>
    w ? `${label} ${w.at.slice(11, 16)}: ${w.airTempC !== undefined ? `${w.airTempC} °C, ` : ''}${CLOUD[w.cloud] ?? w.cloud}, ${RAIN[w.rainNow] ?? w.rainNow}, wind Beaufort ${w.windBeaufort}` : ''
  const herp = s.herp
  const extra = [
    herp?.rainLast24h ? `rain in last 24 h: ${herp.rainLast24h}` : '',
    herp?.hoursSinceRain !== undefined ? `${herp.hoursSinceRain} h since rain` : '',
    herp?.relativeHumidityPct !== undefined ? `RH ${herp.relativeHumidityPct}%` : '',
    herp?.moonVisible ? `moon ${herp.moonVisible.replace('-', ' ')}` : '',
  ].filter(Boolean)
  return [block('Start', s.weatherStart), block('End', s.weatherEnd), extra.join(', ')].filter(Boolean).join(' · ')
}

const minutesBetween = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000)

// ---------- the archive ----------

const EVENT_COLS = [
  'eventID', 'eventDate', 'eventRemarks', 'samplingProtocol', 'sampleSizeValue', 'sampleSizeUnit', 'samplingEffort',
  'locationID', 'footprintWKT', 'geodeticDatum', 'decimalLatitude', 'decimalLongitude',
  'eco:samplingEffortValue', 'eco:samplingEffortUnit', 'eco:isSamplingEffortReported', 'eco:eventDurationValue', 'eco:eventDurationUnit',
  'eco:samplingPerformedBy', 'eco:reportedWeather', 'eco:targetTaxonomicScope', 'eco:isAbsenceReported',
]
const OCC_COLS = [
  'occurrenceID', 'eventID', 'basisOfRecord', 'occurrenceStatus', 'individualCount', 'scientificName', 'taxonID', 'family', 'kingdom',
  'identificationQualifier', 'identificationRemarks', 'sex', 'lifeStage', 'recordedBy', 'eventDate', 'locationID',
  'decimalLatitude', 'decimalLongitude', 'geodeticDatum', 'coordinateUncertaintyInMeters', 'georeferenceProtocol', 'georeferenceRemarks',
  'minimumDistanceAboveSurfaceInMeters', 'behavior', 'occurrenceRemarks',
]
const MOF_COLS = [
  'eventID', 'measurementID', 'occurrenceID', 'measurementType', 'measurementValue', 'measurementUnit', 'measurementAccuracy',
  'measurementMethod', 'measurementDeterminedBy', 'measurementDeterminedDate', 'measurementRemarks',
]

const mofType = (f?: FieldDef) => (f?.dwc?.startsWith('MoF: ') ? f.dwc.slice(5) : f?.label.toLowerCase())

export function buildDwcArchive(input: DwcInput): DwcResult {
  const { records, project } = input
  const skipped: DwcResult['skipped'] = []
  const approved = (r: RecordRow) => r.status === 'approved' && !r.voided && r.reviewedRev === r.rev

  for (const r of records) {
    if (r.voided) skipped.push({ key: r.key, why: 'voided on the phone' })
    else if (r.status !== 'approved') skipped.push({ key: r.key, why: r.status === 'edited' ? 'changed since it was approved' : `not approved (${r.status})` })
  }
  // HQ asked the surveyor to fix something and they haven't answered (no reply, no newer rev): don't publish it yet.
  const waiting = new Set(
    (input.corrections ?? [])
      .filter((c) => c.state === 'approved' && !input.answeredCorrectionIds?.has(c.correctionId))
      .filter((c) => (records.find((r) => r.key === c.recordKey)?.rev ?? 0) <= c.rev)
      .map((c) => c.recordKey),
  )
  const surveys = records.filter((r) => r.recordType === 'survey' && approved(r))
  const surveyIds = new Set(surveys.map((s) => s.id))
  const encounters = records.filter((r) => {
    if (r.recordType !== 'encounter' || !approved(r)) return false
    if (waiting.has(r.key)) {
      skipped.push({ key: r.key, why: "approved, but a correction is waiting for the surveyor's answer" })
      return false
    }
    if (!surveyIds.has((r.data as Encounter).surveyId)) {
      skipped.push({ key: r.key, why: 'approved, but its survey is not approved yet' })
      return false
    }
    return true
  })

  const transect = (id: string) => input.transects?.features.find((f) => f.properties.transectId === id)
  const templateFor = (v: number) => input.templates?.find((t) => t.coreVersion === v) ?? input.template
  const field = (t: Template | undefined, path: string) => t?.fields.find((f) => f.path === path)

  // Events
  const eventRows = surveys.map((row) => {
    const s = row.data as Survey
    const t = transect(s.transectId)
    const coords = t?.geometry.coordinates ?? []
    const mid = coords[Math.floor(coords.length / 2)]
    const tpl = templateFor(s.coreVersion)
    const minutes = s.finishedAt ? minutesBetween(s.startedAt, s.finishedAt) : undefined
    return {
      eventID: s.id,
      eventDate: s.finishedAt ? `${s.startedAt}/${s.finishedAt}` : s.startedAt,
      eventRemarks: s.notes,
      samplingProtocol: `${tpl?.name ?? s.templateId}, core v${s.coreVersion}`,
      sampleSizeValue: t?.properties.lengthM,
      sampleSizeUnit: t ? 'metre' : undefined,
      samplingEffort: s.effortPersonHours !== undefined ? `${s.effortPersonHours} person-hours` : undefined,
      locationID: s.transectId,
      footprintWKT: coords.length ? `LINESTRING (${coords.map(([lon, lat]) => `${lon} ${lat}`).join(', ')})` : undefined,
      geodeticDatum: 'EPSG:4326',
      decimalLatitude: mid?.[1],
      decimalLongitude: mid?.[0],
      'eco:samplingEffortValue': s.effortPersonHours,
      'eco:samplingEffortUnit': s.effortPersonHours !== undefined ? 'person-hours' : undefined,
      'eco:isSamplingEffortReported': s.effortPersonHours !== undefined ? 'true' : 'false',
      'eco:eventDurationValue': minutes,
      'eco:eventDurationUnit': minutes !== undefined ? 'minutes' : undefined,
      'eco:samplingPerformedBy': s.surveyorIds.map((p) => personName(project, p)).join(' | '),
      'eco:reportedWeather': weatherLine(s),
      'eco:targetTaxonomicScope': 'Squamata',
      'eco:isAbsenceReported': 'false',
    }
  })

  // Occurrences and measurements
  const decisions = new Map((input.taxonDecisions ?? []).map((d) => [d.provisionalTaxonId, d]))
  const provisional = new Map((input.provisionalTaxa ?? []).map((p) => [p.provisionalTaxonId, p]))
  const packTaxon = (id?: string) => (id ? input.speciesPack?.taxa.find((t) => t.taxonId === id) : undefined)
  const mofRows: Record<string, unknown>[] = []

  const occRows = encounters.map((row) => {
    const e = row.data as Encounter
    const tpl = templateFor(e.coreVersion)
    let taxonId = e.taxon.taxonId
    let name = e.taxon.scientificName
    let qualifier: string | undefined
    const idNotes: string[] = [`ID basis: ${e.taxon.idBasis.replace('-', ' ')}`]
    if (e.taxon.provisionalTaxonId) {
      const d = decisions.get(e.taxon.provisionalTaxonId)
      const p = provisional.get(e.taxon.provisionalTaxonId)
      if (d?.taxonId && d.decision !== 'rejected') {
        taxonId = d.taxonId
        name = packTaxon(d.taxonId)?.scientificName ?? name
        idNotes.push(`field name "${p?.proposedName ?? '?'}" ${d.decision} by HQ`)
      } else {
        name = name ?? p?.proposedName
        qualifier = 'provisional'
        idNotes.push('provisional field name, not yet confirmed by HQ')
      }
    }
    const k = e.taxon.keyRun
    if (k?.candidates.length) {
      const top = k.candidates[0]!
      idNotes.push(`trait key ${k.keyVersion} (pack ${k.packId} v${k.packVersion}) top match ${top.scientificName}: ${top.matched.join('; ')}`)
    }
    const taxon = packTaxon(taxonId)

    // The "did you mean?" audit trail, in words.
    const loc = e.location
    const c = loc.check
    const geoNotes: string[] = []
    if (loc.typed) geoNotes.push(`typed "${loc.typed.raw}" (${FORMAT_LABELS[loc.typed.format]})`)
    if (loc.original) {
      const s = c.suggestions.find((x) => x.kind === c.decision?.suggestionKind) ?? c.suggestions[0]
      geoNotes.push(`as typed it was ${Math.round(c.offsetM)} m off ${c.transectId} (tolerance ${c.toleranceM} m)`)
      if (s) geoNotes.push(`suggestion accepted: ${s.explain.replace(/\.$/, '')}, giving ${s.offsetM} m from the line`)
    } else {
      geoNotes.push(`${Math.round(c.offsetM * 10) / 10} m from ${c.transectId} at entry (${c.band})`)
    }
    if (c.decision) geoNotes.push(`decision ${c.decision.kind} by ${personName(project, c.decision.by)} at ${c.decision.at}`)
    if (row.hq?.coord) geoNotes.push(`HQ re-check: ${Math.round(row.hq.coord.offsetM * 10) / 10} m from the line, ${Math.round(row.hq.coord.chainageM)} m along`)

    const perch = e.extras?.perchHeightM ?? (typeof e.teamFields?.perchHeightM === 'number' ? e.teamFields.perchHeightM : undefined)
    const verbatimStage = LIFE_STAGE[e.lifeStage] && LIFE_STAGE[e.lifeStage].toLowerCase() !== e.lifeStage ? `life stage recorded as "${e.lifeStage}"` : ''

    const by = personName(project, e.observerId)
    const date = e.observedAt
    const addMof = (id: string, type: string | undefined, value: unknown, unit?: string, accuracy?: number, method?: string, remarks?: string) => {
      if (value === undefined || value === null || !type) return
      mofRows.push({
        eventID: e.surveyId,
        measurementID: `${e.id}:${id}`,
        occurrenceID: e.id,
        measurementType: type,
        measurementValue: value,
        measurementUnit: unit,
        measurementAccuracy: accuracy,
        measurementMethod: method,
        measurementDeterminedBy: by,
        measurementDeterminedDate: date,
        measurementRemarks: remarks,
      })
    }
    addMof('svl', mofType(field(tpl, 'svl')) ?? 'snout-vent length', e.svl?.value, e.svl?.unit, e.svl?.precision, e.svl?.method)
    addMof('tailLength', mofType(field(tpl, 'tailLength')) ?? 'tail length', e.tailLength?.value, e.tailLength?.unit, e.tailLength?.precision, e.tailLength?.method, e.tailCondition ? `tail ${e.tailCondition}` : undefined)
    addMof('mass', mofType(field(tpl, 'mass')) ?? 'mass', e.mass?.value, e.mass?.unit, e.mass?.precision, e.mass?.scaleUsed ?? e.mass?.method, e.mass?.bagTared ? 'bag tared' : undefined)
    const sc = e.scaleCounts ?? {}
    for (const [k2, v] of Object.entries(sc)) {
      const f = field(tpl, `scaleCounts.${k2}`)
      const remark = k2 === 'subcaudals' && e.tailCondition && e.tailCondition !== 'intact' ? `tail ${e.tailCondition}: count may be incomplete` : undefined
      addMof(k2, mofType(f) ?? k2, v, undefined, undefined, undefined, remark)
    }

    return {
      occurrenceID: e.id,
      eventID: e.surveyId,
      basisOfRecord: 'HumanObservation',
      occurrenceStatus: 'present',
      individualCount: 1,
      scientificName: name,
      taxonID: taxonId,
      family: taxon?.family,
      kingdom: 'Animalia',
      identificationQualifier: qualifier,
      identificationRemarks: idNotes.join('; '),
      sex: SEX[e.sex],
      lifeStage: LIFE_STAGE[e.lifeStage],
      recordedBy: by,
      eventDate: e.observedAt,
      locationID: e.transectId,
      decimalLatitude: Number(loc.lat.toFixed(6)),
      decimalLongitude: Number(loc.lon.toFixed(6)),
      geodeticDatum: 'EPSG:4326',
      coordinateUncertaintyInMeters: loc.accuracyM && loc.accuracyM > 0 ? loc.accuracyM : undefined,
      georeferenceProtocol: `${loc.source === 'typed' ? 'typed from a handheld GPS' : loc.source === 'garmin-gpx' ? 'Garmin GPX track' : 'phone GPS'}; checked against the pre-mapped transect line with ${c.checkerVersion}`,
      georeferenceRemarks: geoNotes.join('; '),
      minimumDistanceAboveSurfaceInMeters: perch,
      behavior: e.extras?.behaviour,
      occurrenceRemarks: [e.notes, verbatimStage].filter(Boolean).join(' · ') || undefined,
    }
  })

  const csv = {
    event: toCsv(EVENT_COLS, eventRows),
    occurrence: toCsv(OCC_COLS, occRows),
    mof: toCsv(MOF_COLS, mofRows),
  }
  const stamp = input.createdAt.slice(0, 16).replace(/[-:]/g, '').replace('T', '-')
  const files: Record<string, Uint8Array> = {
    'Event.csv': strToU8(csv.event),
    'Occurrence.csv': strToU8(csv.occurrence),
    'MeasurementOrFact.csv': strToU8(csv.mof),
    'meta.xml': strToU8(metaXml()),
    'eml.xml': strToU8(emlXml(input)),
  }
  if (input.attribution) files['attribution.md'] = strToU8(input.attribution)
  const mtime = new Date(input.createdAt)
  const zip = zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, [v, { level: 6, mtime }]])))
  return {
    zip,
    fileName: `DwC_${project.projectId}_${stamp}.zip`,
    events: eventRows.length,
    occurrences: occRows.length,
    measurements: mofRows.length,
    skipped,
    csv,
  }
}

// ---------- archive descriptors (DwC-A: Event core + Occurrence and MeasurementOrFact extensions) ----------

const TERM: Record<string, string> = {
  'eco:': 'http://rs.tdwg.org/eco/terms/',
}
const termUri = (c: string) => {
  if (c.startsWith('eco:')) return `${TERM['eco:']}${c.slice(4)}`
  if (c.startsWith('measurement')) return `http://rs.tdwg.org/dwc/terms/${c}`
  return `http://rs.tdwg.org/dwc/terms/${c}`
}
const fieldsXml = (cols: string[], skip: string) =>
  cols.map((c, i) => (c === skip ? '' : `    <field index="${i}" term="${termUri(c)}"/>`)).filter(Boolean).join('\n')

function metaXml(): string {
  const file = (name: string) => `<files><location>${name}</location></files>`
  const attrs = 'encoding="UTF-8" fieldsTerminatedBy="," linesTerminatedBy="\\r\\n" fieldsEnclosedBy="&quot;" ignoreHeaderLines="1"'
  return `<?xml version="1.0" encoding="UTF-8"?>
<archive xmlns="http://rs.tdwg.org/dwc/text/" metadata="eml.xml">
  <core ${attrs} rowType="http://rs.tdwg.org/dwc/terms/Event">
    ${file('Event.csv')}
    <id index="0"/>
${fieldsXml(EVENT_COLS, 'eventID')}
    <field index="0" term="http://rs.tdwg.org/dwc/terms/eventID"/>
  </core>
  <extension ${attrs} rowType="http://rs.tdwg.org/dwc/terms/Occurrence">
    ${file('Occurrence.csv')}
    <coreid index="1"/>
${fieldsXml(OCC_COLS, '')}
  </extension>
  <extension ${attrs} rowType="http://rs.iobis.org/obis/terms/ExtendedMeasurementOrFact">
    ${file('MeasurementOrFact.csv')}
    <coreid index="0"/>
${fieldsXml(MOF_COLS, 'eventID')}
  </extension>
</archive>
`
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function emlXml(input: DwcInput): string {
  const dm = input.project.people.find((p) => p.role === 'data-manager')
  return `<?xml version="1.0" encoding="UTF-8"?>
<eml:eml xmlns:eml="eml://ecoinformatics.org/eml-2.1.1" packageId="${esc(input.project.projectId)}-${esc(input.createdAt)}" system="sciworks-hq" xml:lang="en">
  <dataset>
    <title>${esc(input.project.name)}</title>
    <creator><individualName><surName>${esc(dm?.name ?? 'Data Manager')}</surName></individualName></creator>
    <pubDate>${input.createdAt.slice(0, 10)}</pubDate>
    <language>en</language>
    <abstract><para>Herp visual encounter surveys on pre-mapped transects. Approved records only, exported by Sciworks HQ. Demo data: illustrative, not for field ID.</para></abstract>
    <intellectualRights><para>Species reference data CC BY 4.0, see attribution.md.</para></intellectualRights>
  </dataset>
</eml:eml>
`
}
