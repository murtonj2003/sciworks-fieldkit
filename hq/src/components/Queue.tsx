// The QA queue: every record from every team, filterable by team, status and flag.

import type { Project, ReviewStatus } from '@sciworks/shared'
import type { CorrectionRow, RecordRow } from '../db'
import { STATUS_ICON, STATUS_WORD, recordSubtitle, recordTitle } from '../lib/format'

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
}

export function Queue({ project, rows, total, filter, onFilter, selectedKey, onSelect, drafts, provisionalNames, held }: QueueProps) {
  const draftKeys = new Set(drafts.filter((d) => d.state === 'draft').map((d) => d.recordKey))
  const teams = (project?.teams ?? []).filter((t) => t.transectIds.length)
  return (
    <section className="queue" aria-label="QA queue">
      <div className="queue-filters">
        <label>
          Team
          <select value={filter.team} onChange={(e) => onFilter({ ...filter, team: e.target.value })}>
            <option value="all">All teams</option>
            {teams.map((t) => (
              <option key={t.teamId} value={t.teamId}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select value={filter.status} onChange={(e) => onFilter({ ...filter, status: e.target.value as StatusFilter })}>
            <option value="to-review">To review</option>
            <option value="flagged">Flagged</option>
            <option value="edited">Edited</option>
            <option value="received">Not flagged</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="all">Everything</option>
          </select>
        </label>
        <label>
          Show
          <select value={filter.flag} onChange={(e) => onFilter({ ...filter, flag: e.target.value as QueueFilter['flag'] })}>
            <option value="any">Any</option>
            <option value="flagged">With a warning</option>
            <option value="ai-draft">With an AI draft</option>
          </select>
        </label>
        <label>
          Type
          <select value={filter.type} onChange={(e) => onFilter({ ...filter, type: e.target.value as QueueFilter['type'] })}>
            <option value="all">All</option>
            <option value="encounter">Animals</option>
            <option value="survey">Surveys</option>
          </select>
        </label>
      </div>
      <div className="queue-count">
        {rows.length} of {total} records
        {held > 0 && (
          <span title="Saved on the phone before they were complete (for example, no location yet). Kept aside; they appear here once a complete version arrives.">
            {' '}
            · {held} incomplete held aside
          </span>
        )}
      </div>
      <ol className="queue-list" role="listbox" aria-label="Records">
        {rows.map((r) => (
          <li
            key={r.key}
            role="option"
            aria-selected={r.key === selectedKey}
            className={`queue-row status-${r.status}${r.key === selectedKey ? ' is-selected' : ''}`}
            onClick={() => onSelect(r.key)}
          >
            <span className="queue-status" title={STATUS_WORD[r.status]}>
              <span aria-hidden>{STATUS_ICON[r.status]}</span> {STATUS_WORD[r.status]}
            </span>
            <span className="queue-title">{recordTitle(r, provisionalNames)}</span>
            <span className="queue-sub">
              {project?.teams.find((t) => t.teamId === r.teamId)?.name ?? r.teamId} · {recordSubtitle(r, project)}
            </span>
            <span className="queue-tags">
              {r.flags.filter((f) => f.level === 'warn').length > 0 && (
                <span className="tag tag-warn">⚠ {r.flags.filter((f) => f.level === 'warn').length} warning{r.flags.filter((f) => f.level === 'warn').length === 1 ? '' : 's'}</span>
              )}
              {r.flags.some((f) => f.code === 'FIXED_IN_FIELD') && <span className="tag tag-info">↺ fixed in field</span>}
              {draftKeys.has(r.key) && <span className="tag tag-ai">AI draft</span>}
              {r.rev > 1 && <span className="tag">rev {r.rev}</span>}
            </span>
          </li>
        ))}
        {rows.length === 0 && <li className="queue-empty">Nothing here. Change the filters, or import a Field bundle.</li>}
      </ol>
      <div className="queue-keys">
        <kbd>↑</kbd>
        <kbd>↓</kbd> move · <kbd>A</kbd> approve · <kbd>R</kbd> reject · <kbd>C</kbd> correction
      </div>
    </section>
  )
}
