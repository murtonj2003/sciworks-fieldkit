// AI reviewer: what it is (as tags), the key and the auto-review switch, then the last review sorted into Drafts,
// Notes, Summary and Steps. Everything it produces is a suggestion: drafts are approved or discarded on each record
// ("Did you mean?").

import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import type { Project } from '@sciworks/shared'
import { db, type RecordRow } from '../db'
import { Icon, Mark } from '../kit/Icons'
import { AiTags, Dialog } from '../kit/ui'
import { AI_MODEL, requestStop } from '../lib/ai/agent'
import { forgetApiKey, getApiKey, getAutoReview, maskedKey, setApiKey, setAutoReview } from '../lib/ai/apiKey'
import { fieldsFor, fmtValue, recordTitle, shortLabel } from '../lib/format'
import { shortTime } from '../lib/time'

type Tab = 'drafts' | 'notes' | 'summary'

interface Props {
  project?: Project
  onClose: () => void
  onSelect: (key: string) => void
  onReviewAll: () => void
  keyVersion: number
  onKeyChanged: () => void
}

export function AiPanel({ onClose, onSelect, onReviewAll, onKeyChanged }: Props) {
  const runs = useLiveQuery(() => db.aiRuns.orderBy('startedAt').reverse().limit(5).toArray(), [], [])
  const corrections = useLiveQuery(() => db.corrections.toArray(), [], [])
  const records = useLiveQuery(() => db.records.toArray(), [], [])
  const notes = useLiveQuery(() => db.aiNotes.toArray(), [], [])
  const [draftKey, setDraftKey] = useState('')
  const [auto, setAuto] = useState(getAutoReview())
  const templates = useLiveQuery(() => db.templates.orderBy('coreVersion').toArray(), [], [])
  const [tab, setTab] = useState<Tab>()
  const key = getApiKey()
  const byKey = new Map(records.map((r) => [r.key, r] as [string, RecordRow]))
  const run = runs[0]
  const online = typeof navigator === 'undefined' || navigator.onLine
  const fields = fieldsFor('encounter', templates[templates.length - 1]?.data)
  const labelOf = (path: string) => shortLabel(fields.find((f) => f.path === path)?.label ?? path)
  // A measurement's number and unit only (its method and precision stay on the record).
  const valueOf = (path: string, v: unknown) => {
    const f = fields.find((x) => x.path === path)
    return fmtValue(v && typeof v === 'object' && 'value' in v ? (v as { value: unknown }).value : v, f)
  }
  const runNotes = run ? notes.filter((x) => x.runId === run.runId) : []
  const tabs: [Tab, string, number?][] = run
    ? [
        ['drafts', 'Drafts', run.draftIds.length],
        ['notes', 'Notes', runNotes.length],
        ['summary', 'Summary'],
      ]
    : []
  // Open on the first category that has something in it.
  const shown: Tab = tab ?? (run?.draftIds.length ? 'drafts' : runNotes.length ? 'notes' : 'summary')
  const title = (k: string) => {
    const r = byKey.get(k)
    return r ? <span className={r.recordType === 'encounter' ? 'fk-sp' : undefined}>{recordTitle(r)}</span> : k
  }

  return (
    <Dialog
      title="AI reviewer"
      wide
      onClose={onClose}
      foot={
        <>
          {(!key || !online) && <span className="fk-small hq-ai-why">{!key ? 'Save a key to run a review' : 'No internet right now'}</span>}
          {run?.state === 'running' && (
            <button className="fk-btn fk-btn--grey fk-btn--36" onClick={requestStop}>
              Stop
            </button>
          )}
          <button
            className="fk-btn fk-btn--primary fk-btn--36"
            onClick={onReviewAll}
            disabled={!key || !online || run?.state === 'running'}
          >
            <Icon name="reviewer" />
            Review everything not yet approved
          </button>
        </>
      }
    >
      <ul className="hq-ai-tags" aria-label="How the AI reviewer works">
        <li className="fk-tag">
          <Icon name="pencil" />
          Drafts only, never edits
        </li>
        <li className="fk-tag">
          <Icon name="check" />
          You approve every change
        </li>
        <li className="fk-tag">
          <Icon name="cloud" />
          Needs internet
        </li>
        <li className="fk-tag">
          <Icon name="camera" />
          No photos sent
        </li>
      </ul>

      <div className="fk-group hq-ai-set">
        {key ? (
          <div className="fk-card hq-ai-key">
            <span>
              Key <span className="hq-coord">{maskedKey(key)}</span>
            </span>
            <span className="fk-tag hq-ai-key__lock">
              <Icon name="lock" />
              Stays in this browser
            </span>
            <button
              className="hq-textlink"
              onClick={() => {
                forgetApiKey()
                onKeyChanged()
              }}
            >
              Forget key
            </button>
          </div>
        ) : (
          <form
            className="fk-card hq-ai-key"
            onSubmit={(e) => {
              e.preventDefault()
              if (draftKey.trim()) {
                setApiKey(draftKey)
                setDraftKey('')
                onKeyChanged()
              }
            }}
          >
            <input
              className="hq-input"
              type="password"
              autoComplete="off"
              spellCheck={false}
              aria-label="Anthropic API key"
              value={draftKey}
              onChange={(e) => setDraftKey(e.target.value)}
              placeholder="Anthropic API key (sk-ant-…)"
            />
            <span className="fk-tag hq-ai-key__lock">
              <Icon name="lock" />
              Stays in this browser
            </span>
            <button className="fk-btn fk-btn--primary fk-btn--36" type="submit" disabled={!draftKey.trim()}>
              Save
            </button>
          </form>
        )}
        <div className="hq-ai-set__row">
          <label className="hq-check">
            <input
              type="checkbox"
              checked={auto}
              onChange={(e) => {
                setAuto(e.target.checked)
                setAutoReview(e.target.checked)
              }}
            />
            Review new records after each import{!key && auto ? ' (once a key is saved)' : ''}
          </label>
          <span className="fk-src">{AI_MODEL}</span>
        </div>
      </div>

      {!online && (
        <p className="fk-hint">
          <Icon name="info" />
          <span>No internet, so it can't run now. The checks already ran on import.</span>
        </p>
      )}

      {run && (
        <div className="fk-group">
          <div className="hq-ai-run">
            <h3>{run.state === 'running' ? 'Reviewing…' : run.state === 'done' ? 'Last review' : run.state === 'stopped' ? 'Review stopped' : 'Last review failed'}</h3>
            <span className="fk-small">
              {shortTime(run.startedAt)} · {run.scopeKeys.length} records
            </span>
          </div>
          {run.error && (
            <p className="fk-error" style={{ margin: '0 8px 8px' }}>
              <Icon name="warning" />
              {run.error}
            </p>
          )}
          <div className="fk-seg fk-seg--sm hq-ai-tabs" role="radiogroup" aria-label="Show">
            {tabs.map(([t, label, n]) => (
              <button key={t} role="radio" aria-checked={shown === t} onClick={() => setTab(t)}>
                {label}
                {n !== undefined && <span className="hq-ai-tabs__n">{n}</span>}
              </button>
            ))}
          </div>
          <div className="fk-card hq-ai-pane">
            {shown === 'drafts' &&
              (run.draftIds.length ? (
                run.draftIds.map((id) => {
                  const c = corrections.find((x) => x.correctionId === id)
                  if (!c) return null
                  return (
                    <div key={id} className="hq-ai-item">
                      <div className="hq-ai-item__top">
                        <button className="hq-textlink" onClick={() => onSelect(c.recordKey)}>
                          {title(c.recordKey)}
                        </button>
                        {c.state === 'draft' ? (
                          <span className="fk-tag fk-tag--draft">Draft</span>
                        ) : c.state === 'approved' ? (
                          <span className="pg-tag-ok">
                            <Icon name="check" />
                            Approved
                          </span>
                        ) : (
                          <span className="fk-tag">Discarded</span>
                        )}
                      </div>
                      <p className="hq-ai-item__chg">
                        <span className="hq-ai-item__old">
                          {labelOf(c.fieldPath)} {valueOf(c.fieldPath, c.current)}
                        </span>{' '}
                        <Icon name="arrow" label="to" /> <b>{valueOf(c.fieldPath, c.proposed)}</b>
                      </p>
                      <p className="hq-ai-item__why">{c.reason}</p>
                    </div>
                  )
                })
              ) : (
                <p className="hq-ai-none">No drafts: nothing needed a correction.</p>
              ))}
            {shown === 'notes' &&
              (runNotes.length ? (
                runNotes.map((x) => (
                  <div key={x.id} className="hq-ai-item">
                    <div className="hq-ai-item__top">
                      <button className="hq-textlink" onClick={() => onSelect(x.recordKey)}>
                        {title(x.recordKey)}
                      </button>
                      <span className="fk-tag fk-tag--draft">Note</span>
                    </div>
                    <p className="hq-ai-item__why">{x.text}</p>
                  </div>
                ))
              ) : (
                <p className="hq-ai-none">No notes.</p>
              ))}
            {shown === 'summary' &&
              (run.summary ? (
                <div className="hq-ai-item">
                  <div className="hq-ai-item__top">
                    <span className="fk-dym__lbl">Per team</span>
                    <AiTags draft={false} />
                  </div>
                  <p className="hq-summary">{run.summary}</p>
                </div>
              ) : (
                <p className="hq-ai-none">{run.state === 'running' ? 'The summary comes at the end.' : 'No summary was written.'}</p>
              ))}
          </div>
          <details className="pg-why hq-ai-steps" open={run.state === 'running'}>
            <summary>
              <Icon name="chev-down" />
              Show steps ({run.steps.length})
            </summary>
            <ol className="hq-run-steps">
              {run.steps.map((st, i) => (
                <li key={i} className={st.kind === 'error' ? 'is-error' : st.kind === 'text' ? 'is-text' : undefined}>
                  {st.kind === 'tool' ? <Icon name="chev" /> : st.kind === 'error' ? <Icon name="warning" /> : <Mark band="none" />}
                  <span>{st.text}</span>
                </li>
              ))}
            </ol>
          </details>
        </div>
      )}
    </Dialog>
  )
}
