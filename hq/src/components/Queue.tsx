// The QA queue: every record from every team, filterable by team, status and flag.

import type { Encounter, Project, ReviewStatus } from '@sciworks/shared'
import type { CorrectionRow, RecordRow } from '../db'
import { FoldButton } from '../kit/Rail'
import { Icon } from '../kit/Icons'
import { StatusChip, Tag } from '../kit/ui'
import { recordSubtitle, recordTitle } from '../lib/format'

export type StatusFilter = 'to-review' | 'all' | ReviewStatus
export interface QueueFilter {
  team: string
  status: StatusFilter
  flag: 'any' | 'flagged' | 'ai-draft'
  type: 'all' | 'encounter' | 'survey'
}

export const DEFAULT_FILTER: QueueFilter = { team: 'all', status: 'to-review', flag: 'any', type: 'all' }

export function applyFilter(rows: RecordRow[], f: QueueFilter, drafts: CorrectionRow[]): RecordRow[] {
  const withDraft = new Set(drafts.filter((d) => d.state === 'draft').map((d) => d.recordKey))
  return rows.filter((r) => {
    if (r.voided && f.status !== 'all') return false
    if (f.team !== 'all' && r.teamId !== f.team) return false
    if (f.type !== 'all' && r.recordType !== f.type) return false
    if (f.status === 'to-review' && !(r.status === 'received' || r.status === 'flagged' || r.status === 'edited')) return false
    if (f.status !== 'to-review' && f.status !== 'all' && r.status !== f.status) return false
    if (f.flag === 'flagged' && !r.flagged) return false
    if (f.flag === 'ai-draft' && !withDraft.has(r.key)) return false
    return true
  })
}

/** Walk order: by survey date, the survey first, then animals in the order they were seen. */
export function sortRows(rows: RecordRow[]): RecordRow[] {
  const t = (r: RecordRow) => (r.recordType === 'survey' ? (r.data as { startedAt: string }).startedAt : (r.data as { observedAt: string }).observedAt)
  return [...rows].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.teamId.localeCompare(b.teamId) ||
      (a.surveyId ?? '').localeCompare(b.surveyId ?? '') ||
      (a.recordType === b.recordType ? 0 : a.recordType === 'survey' ? -1 : 1) ||
      t(a).localeCompare(t(b)),
  )
}

interface QueueProps {
  project?: Project
  rows: RecordRow[]
  total: number
  filter: QueueFilter
  onFilter: (f: QueueFilter) => void
  selectedKey?: string
  onSelect: (key: string) => void
  drafts: CorrectionRow[]
  provisionalNames: Map<string, string>
  /** Records seen only in an incomplete state so far (kept aside, not in the queue). */
  held: number
  /** Records with an AI note waiting. */
  noteKeys: Set<string>
  /** taxonIds the species pack marks as venomous. */
  venomous: Set<string>
  stats: { toReview: number; flagged: number; approved: number }
  /** Folds the queue to a slim rail. */
  onFold?: () => void
}

function Select<T extends string>({ label, value, def, onChange, options }: { label: string; value: T; def: T; onChange: (v: T) => void; options: [T, string][] }) {
  return (
    <label className={`hq-sel${value !== def ? ' is-set' : ''}`}>
      <span className="hq-sel__k">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
      <Icon name="chev-down" />
    </label>
  )
}

export function Queue(props: QueueProps) {
  const { project, rows, total, filter, onFilter, selectedKey, onSelect, drafts, provisionalNames, held, noteKeys, venomous, stats } = props
  const draftKeys = new Set(drafts.filter((d) => d.state === 'draft').map((d) => d.recordKey))
  const teams = (project?.teams ?? []).filter((t) => t.transectIds.length)
  return (
    <section className="fk-col" aria-label="QA queue">
      <div className="fk-col-h">
        <div className="hq-col-h__l">
          {props.onFold && <FoldButton side="left" label="Fold the queue away" keyHint="[" onClick={props.onFold} />}
          <h3>QA queue</h3>
        </div>
        <span className="fk-stats">
          <b>{stats.toReview}</b> to review · <b>{stats.flagged}</b> flagged · <b>{stats.approved}</b> approved
        </span>
      </div>
      <div className="hq-filters" role="group" aria-label="Filters">
        <Select label="Team" value={filter.team} def="all" onChange={(team) => onFilter({ ...filter, team })} options={[['all', 'All teams'], ...teams.map((t) => [t.teamId, t.name] as [string, string])]} />
        <Select<StatusFilter>
          label="Status"
          value={filter.status}
          def="to-review"
          onChange={(status) => onFilter({ ...filter, status })}
          options={[
            ['to-review', 'To review'],
            ['flagged', 'Flagged'],
            ['edited', 'Edited'],
            ['received', 'Received'],
            ['approved', 'Approved'],
            ['rejected', 'Rejected'],
            ['all', 'Everything'],
          ]}
        />
        <Select<QueueFilter['flag']>
          label="Show"
          value={filter.flag}
          def="any"
          onChange={(flag) => onFilter({ ...filter, flag })}
          options={[
            ['any', 'Any'],
            ['flagged', 'With a warning'],
            ['ai-draft', 'With an AI draft'],
          ]}
        />
        <Select<QueueFilter['type']>
          label="Type"
          value={filter.type}
          def="all"
          onChange={(type) => onFilter({ ...filter, type })}
          options={[
            ['all', 'All'],
            ['encounter', 'Animals'],
            ['survey', 'Surveys'],
          ]}
        />
      </div>
      <p className="hq-count">
        <b>
          {rows.length} of {total} records
        </b>
        {held > 0 && ` · ${held} incomplete, held until complete`}
      </p>
      <div className="fk-group fk-queue">
        <div className="fk-list" role="listbox" aria-label="Records">
          {rows.map((r) => {
            const warnings = r.flags.filter((f) => f.level === 'warn').length
            const e = r.recordType === 'encounter' ? (r.data as Encounter) : undefined
            const venom = !!e?.taxon.taxonId && venomous.has(e.taxon.taxonId)
            const fixed = r.flags.some((f) => f.code === 'FIXED_IN_FIELD')
            const hasTags = venom || warnings > 0 || fixed || draftKeys.has(r.key) || noteKeys.has(r.key) || r.rev > 1
            return (
              <button
                key={r.key}
                role="option"
                aria-selected={r.key === selectedKey}
                className={`fk-qrow${r.key === selectedKey ? ' is-selected' : ''}`}
                onClick={() => onSelect(r.key)}
              >
                <span className="fk-qrow__top">
                  <span className={`fk-qrow__title${e && !e.taxon.unidentified ? ' fk-sp' : ''}`}>{recordTitle(r, provisionalNames)}</span>
                  <StatusChip status={r.status} />
                </span>
                <span className="fk-qrow__sub">
                  {project?.teams.find((t) => t.teamId === r.teamId)?.name ?? r.teamId} · {recordSubtitle(r, project)}
                </span>
                {hasTags && (
                  <span className="fk-qrow__tags">
                    {venom && <Tag kind="venom">VENOMOUS</Tag>}
                    {warnings > 0 && (
                      <Tag icon="warning">
                        {warnings} warning{warnings === 1 ? '' : 's'}
                      </Tag>
                    )}
                    {fixed && <Tag icon="crosshair">fixed in field</Tag>}
                    {draftKeys.has(r.key) && <Tag kind="draft">AI draft</Tag>}
                    {noteKeys.has(r.key) && <Tag kind="draft">AI note</Tag>}
                    {r.rev > 1 && <Tag>v{r.rev}</Tag>}
                  </span>
                )}
              </button>
            )
          })}
          {rows.length === 0 && (
            <div className="fk-empty hq-qempty">
              <b>Nothing here.</b>Change the filters, or import a Field bundle.
            </div>
          )}
        </div>
      </div>
      <p className="fk-keys hq-keys">
        <span>
          <span className="fk-kbd" aria-label="Up">
            <Icon name="up" />
          </span>{' '}
          <span className="fk-kbd" aria-label="Down" style={{ transform: 'rotate(180deg)' }}>
            <Icon name="up" />
          </span>{' '}
          move
        </span>
        <span>
          <span className="fk-kbd">A</span>approve
        </span>
        <span>
          <span className="fk-kbd">R</span>reject
        </span>
        <span>
          <span className="fk-kbd">C</span>correction
        </span>
      </p>
    </section>
  )
}
