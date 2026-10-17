// HQ's laptop database (IndexedDB via Dexie).
// Rule: nothing is ever deleted. Every raw bundle file is kept, so the whole database can be rebuilt from them.

import Dexie, { type EntityTable } from 'dexie'
import type {
  Basemap,
  ChangeRequest,
  ChangeRequestDecision,
  CoordCheck,
  CoordFlag,
  CorrectionResponse,
  Encounter,
  Manifest,
  Overlay,
  Photo,
  ProvisionalTaxon,
  RecordType,
  ReviewStatus,
  Survey,
  TaxonDecision,
  Template,
} from '@sciworks/shared'
import type { RangeWarning } from '@sciworks/shared'

export type AnyRecord = Survey | Encounter

/** A raw bundle file, exactly as it arrived (or left). Keyed by the SHA-256 of the whole file. */
export interface RawBundleRow {
  sha256: string
  fileName: string
  direction: 'in' | 'out'
  kind: 'field' | 'hq' | 'unreadable'
  manifest?: Manifest
  teamId?: string
  deviceId?: string
  createdAt?: string
  firstImportedAt: string
  lastImportedAt: string
  timesImported: number
  bytes: Uint8Array
  summary?: ImportSummary
  error?: string
}

export interface ImportSummary {
  fileName: string
  ok: boolean
  error?: string
  kind?: 'field' | 'hq'
  teamId?: string
  alreadyHadFile: boolean
  newRecords: number
  updatedRecords: number
  duplicates: number
  olderRevs: number
  editedAfterReview: number
  newPhotos: number
  newProvisionalTaxa: number
  newChangeRequests: number
  newCorrectionResponses: number
  /** Items that failed the import checks (e.g. an animal saved before its location): kept aside, never dropped. */
  heldAside: number
  /** Records whose current version changed in this import (what the AI reviewer looks at next). */
  changedKeys?: string[]
  overlayAdopted?: number
  badFiles: { path: string; message: string }[]
  setupApplied?: string[]
}

/** One flag, in plain words, with where it came from. */
export interface FlagItem {
  code: string
  source: 'phone' | 'hq' | 'range' | 'batch' | 'setup' | 'ai'
  level: 'warn' | 'info'
  text: string
}

/** HQ's own check results for the current rev. Stored BESIDE the phone's location.check, never over it. */
export interface HqCheck {
  rev: number
  checkedAt: string
  coord?: CoordCheck
  ranges: RangeWarning[]
  batchFlags: CoordFlag[]
  transectMissing?: boolean
}

/** The current (highest-rev) version of each record, plus HQ's review state. */
export interface RecordRow {
  key: string // 'encounter:<uuid>'
  recordType: RecordType
  id: string
  rev: number
  teamId: string
  transectId: string
  surveyId?: string
  date: string
  data: AnyRecord
  voided: boolean
  status: ReviewStatus
  reviewedRev?: number
  statusNote?: string
  statusBy?: string
  statusAt?: string
  hq?: HqCheck
  flags: FlagItem[]
  flagged: 0 | 1
  firstReceivedAt: string
  lastReceivedAt: string
}

/** Every rev ever received. The current one is in `records` too; the rest are history. */
export interface RevisionRow {
  key: string // 'encounter:<uuid>:<rev>'
  recordKey: string
  recordType: RecordType
  id: string
  rev: number
  data: AnyRecord
  receivedAt: string
  bundleSha: string
}

/** Append-only log of review decisions. The latest per record goes back to the phone as a Review. */
export interface ReviewLogRow {
  seq?: number
  recordKey: string
  recordType: RecordType
  id: string
  rev: number
  status: ReviewStatus
  note?: string
  by: string
  at: string
}

export interface CorrectionRow {
  correctionId: string
  recordKey: string
  recordType: RecordType
  recordId: string
  rev: number
  teamId: string
  fieldPath: string
  current: unknown
  proposed: unknown
  reason: string
  source: 'ai-agent' | 'data-manager'
  state: 'draft' | 'approved' | 'discarded'
  createdAt: string
  approvedBy?: string
  approvedAt?: string
}

export interface PhotoRow {
  key: string // '<photoId>:<sha256>'
  photoId: string
  recordId: string
  sha256: string
  meta: Photo
  bytes: Uint8Array
  bundleSha: string
}

export interface ProvisionalTaxonRow {
  provisionalTaxonId: string
  teamId: string
  data: ProvisionalTaxon
  receivedAt: string
}

export interface ChangeRequestRow {
  changeRequestId: string
  teamId: string
  data: ChangeRequest
  receivedAt: string
}

export interface CorrectionResponseRow {
  correctionId: string
  data: CorrectionResponse
  receivedAt: string
}

export interface OverlayRow {
  key: string // '<teamId>:<overlayRev>'
  teamId: string
  overlayRev: number
  data: Overlay
  receivedAt: string
}

export interface DeviceRow {
  deviceId: string
  teamId: string
  personId?: string
  appVersion?: string
  lastBundleAt: string
  lastImportedAt: string
  bundles: number
  revsReceived: number
}

export interface TemplateRow {
  coreVersion: number
  data: Template
  publishedAt: string
}

export interface KvRow {
  key: string
  value: unknown
}

export interface QuarantineRow {
  seq?: number
  /** '<path>:<id>:<rev>' when the item has them, so a re-sent incomplete record is held once. */
  itemKey: string
  recordKey?: string
  bundleSha: string
  path: string
  index?: number
  value: unknown
}

/** One AI review run. The AI only reads and drafts; this is its log, kept for the Data Manager to audit. */
export interface AiRunRow {
  runId: string
  startedAt: string
  finishedAt?: string
  state: 'running' | 'done' | 'failed' | 'stopped'
  model: string
  /** Which records it was asked to look at. */
  scopeKeys: string[]
  scopeLabel: string
  steps: { at: string; kind: 'tool' | 'text' | 'info' | 'error'; text: string }[]
  summary?: string
  draftIds: string[]
  noteIds: number[]
  error?: string
  usage?: { inputTokens: number; outputTokens: number }
}

/** A flag the AI raised on a record, in plain words. Shown as a suggestion; never changes the record or its status. */
export interface AiNoteRow {
  id?: number
  runId: string
  recordKey: string
  text: string
  at: string
  dismissed?: boolean
}

/** A satellite picture to draw under the transect lines, offline (SHARED-CONTRACT changelog, Sat 16:50). */
export interface BasemapRow {
  basemapId: string
  meta: Basemap
  /** The JPEG, exactly as it arrived (its SHA-256 matches meta.sha256: readBundle checks it). */
  bytes: Uint8Array
  receivedAt: string
}

export class HqDb extends Dexie {
  bundles!: EntityTable<RawBundleRow, 'sha256'>
  records!: EntityTable<RecordRow, 'key'>
  revisions!: EntityTable<RevisionRow, 'key'>
  reviewLog!: EntityTable<ReviewLogRow, 'seq'>
  corrections!: EntityTable<CorrectionRow, 'correctionId'>
  photos!: EntityTable<PhotoRow, 'key'>
  provisionalTaxa!: EntityTable<ProvisionalTaxonRow, 'provisionalTaxonId'>
  taxonDecisions!: EntityTable<TaxonDecision, 'provisionalTaxonId'>
  changeRequests!: EntityTable<ChangeRequestRow, 'changeRequestId'>
  changeRequestDecisions!: EntityTable<ChangeRequestDecision, 'changeRequestId'>
  correctionResponses!: EntityTable<CorrectionResponseRow, 'correctionId'>
  overlays!: EntityTable<OverlayRow, 'key'>
  devices!: EntityTable<DeviceRow, 'deviceId'>
  templates!: EntityTable<TemplateRow, 'coreVersion'>
  setup!: EntityTable<KvRow, 'key'>
  settings!: EntityTable<KvRow, 'key'>
  quarantine!: EntityTable<QuarantineRow, 'seq'>
  aiRuns!: EntityTable<AiRunRow, 'runId'>
  aiNotes!: EntityTable<AiNoteRow, 'id'>
  basemaps!: EntityTable<BasemapRow, 'basemapId'>

  constructor(name = 'sciworks-hq') {
    super(name)
    this.version(1).stores({
      bundles: 'sha256, direction, kind, teamId, deviceId, lastImportedAt',
      records: 'key, recordType, id, teamId, transectId, surveyId, date, status, flagged, [transectId+date]',
      revisions: 'key, recordKey, [recordKey+rev], bundleSha',
      reviewLog: '++seq, recordKey, at',
      corrections: 'correctionId, recordKey, teamId, state',
      photos: 'key, photoId, recordId',
      provisionalTaxa: 'provisionalTaxonId, teamId',
      taxonDecisions: 'provisionalTaxonId',
      changeRequests: 'changeRequestId, teamId',
      changeRequestDecisions: 'changeRequestId',
      correctionResponses: 'correctionId',
      overlays: 'key, teamId, [teamId+overlayRev]',
      devices: 'deviceId, teamId',
      templates: 'coreVersion',
      setup: 'key',
      settings: 'key',
      quarantine: '++seq, bundleSha',
    })
    this.version(2).stores({
      quarantine: '++seq, &itemKey, bundleSha, recordKey',
    })
    this.version(3).stores({
      aiRuns: 'runId, startedAt, state',
      aiNotes: '++id, runId, recordKey',
    })
    this.version(4).stores({
      basemaps: 'basemapId',
    })
  }
}

/** Each project folder is its own database, so projects never mix. The one in use is remembered in this browser. */
export const DEFAULT_DB = 'sciworks-hq'
export const CURRENT_DB_KEY = 'sciworks-hq.current-db'
export function currentDbName(): string {
  try {
    return localStorage.getItem(CURRENT_DB_KEY) || DEFAULT_DB
  } catch {
    return DEFAULT_DB
  }
}

export const db = new HqDb(currentDbName())

/** Every table, for transactions that must be all-or-nothing. */
export const allTables = (d: HqDb = db) => d.tables

export const recordKey = (recordType: RecordType, id: string) => `${recordType}:${id}`
export const revisionKey = (recordType: RecordType, id: string, rev: number) => `${recordType}:${id}:${rev}`
