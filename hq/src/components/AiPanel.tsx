// AI reviewer: the key box, what the last review did, its summary and its drafts. Everything it produces is a
// suggestion: drafts are approved or discarded on each record ("Did you mean?").

import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import type { Project } from '@sciworks/shared'
import { db, type RecordRow } from '../db'
import { Icon, Mark } from '../kit/Icons'
import { AiTags, Dialog } from '../kit/ui'
import { AI_MODEL, requestStop } from '../lib/ai/agent'
import { forgetApiKey, getApiKey, getAutoReview, maskedKey, setApiKey, setAutoReview } from '../lib/ai/apiKey'
import { fmtValue, recordTitle } from '../lib/format'
import { shortTime } from '../lib/time'

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
  const key = getApiKey()
  const byKey = new Map(records.map((r) => [r.key, r] as [string, RecordRow]))
  const run = runs[0]
  const online = typeof navigator === 'undefined' || navigator.onLine
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
          {run?.state === 'running' && (
            <button className="fk-btn fk-btn--grey fk-btn--36" onClick={requestStop}>
              Stop
            </button>
          )}
          <button className="fk-btn fk-btn--primary fk-btn--36" onClick={onReviewAll} disabled={!key || !online || run?.state === 'running'}>
            <Icon name="reviewer" />
            Review everything not yet approved
          </button>
        </>
      }
    >
      <p>
        It <b>drafts</b>; you decide. It checks the records with the same checkers as the phones and drafts corrections and notes. It never changes a
        record: you approve, edit or discard every draft.
      </p>
      <p className="fk-small">
        When it runs, the records it reviews (species, measurements, coordinates, notes and check results; no photos) go to Anthropic's API with your
        key. It needs the internet; everything else in Fieldkit HQ works offline.
      </p>

      <div className="fk-group">
        {key ? (
          <div className="fk-card hq-form">
            <p className="hq-check" style={{ justifyContent: 'space-between' }}>
              <span>
                Key saved in this browser only: <span className="hq-coord">{maskedKey(key)}</span>
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
            </p>
          </div>
        ) : (
          <form
            className="fk-card hq-form"
            onSubmit={(e) => {
              e.preventDefault()
              if (draftKey.trim()) {
                setApiKey(draftKey)
                setDraftKey('')
                onKeyChanged()
              }
            }}
          >
            <label>
              Anthropic API key
              <input className="hq-input" type="password" autoComplete="off" spellCheck={false} value={draftKey} onChange={(e) => setDraftKey(e.target.value)} placeholder="sk-ant-…" />
            </label>
            <p className="fk-help">
              <Icon name="lock" className="fk-ico--14" /> Kept only in this browser's storage: never in a file, a bundle, the HQ backup or a log.
            </p>
            <div className="hq-form__acts">
              <button className="fk-btn fk-btn--primary fk-btn--36" type="submit" disabled={!draftKey.trim()}>
                Save in this browser
              </button>
            </div>
          </form>
        )}
        <label className="hq-check" style={{ margin: '10px 8px 4px' }}>
          <input
            type="checkbox"
            checked={auto}
            onChange={(e) => {
              setAuto(e.target.checked)
              setAutoReview(e.target.checked)
            }}
          />
          Review new records automatically after each import
        </label>
        {!key && auto && (
          <p className="fk-help" style={{ margin: '0 8px 6px 34px' }}>
            Starts once a key is saved.
          </p>
        )}
        <p className="fk-small" style={{ margin: '6px 8px 4px', fontSize: 12 }}>
          Model: {AI_MODEL}
        </p>
      </div>
      {!key && <p className="fk-help">Save a key first to review records.</p>}

      {!online && (
        <p className="fk-hint">
          <Icon name="info" />
          <span>No internet connection, so the AI reviewer can't run now. The checks have already run on import.</span>
        </p>
      )}

      {run && (
        <div className="fk-group">
          <div className="fk-dym__head" style={{ padding: '6px 8px 8px' }}>
            <h3 className="fk-dym__title" style={{ fontSize: 17 }}>
              {run.state === 'running' ? 'Reviewing…' : run.state === 'done' ? 'Last review' : run.state === 'stopped' ? 'Review stopped' : 'Last review failed'}
            </h3>
            <span className="fk-small">
              {shortTime(run.startedAt)} · {run.scopeKeys.length} records ({run.scopeLabel})
            </span>
          </div>
          {run.error && (
            <p className="fk-error" style={{ margin: '0 8px 8px' }}>
              <Icon name="warning" />
              {run.error}
            </p>
          )}
          {run.summary && (
            <div className="fk-card" style={{ marginBottom: 6 }}>
              <div className="fk-dym__head" style={{ padding: '10px 12px 0' }}>
                <span className="fk-dym__lbl">Summary</span>
                <AiTags draft={false} />
              </div>
              <p className="hq-summary">{run.summary}</p>
            </div>
          )}
          {run.draftIds.length > 0 && (
            <div className="fk-card hq-ver" style={{ marginBottom: 6 }}>
              {run.draftIds.map((id) => {
                const c = corrections.find((x) => x.correctionId === id)
                if (!c) return null
                return (
                  <div key={id} className="hq-ver__row">
                    {c.state === 'draft' ? <span className="fk-tag fk-tag--draft">Draft</span> : c.state === 'approved' ? <span className="pg-tag-ok"><Icon name="check" />Approved</span> : <span className="fk-tag">Discarded</span>}{' '}
                    <button className="hq-textlink" onClick={() => onSelect(c.recordKey)}>
                      {title(c.recordKey)}
                    </button>
                    : {c.fieldPath} {fmtValue(c.current)} <Icon name="arrow" label="to" /> <b>{fmtValue(c.proposed)}</b>
                    <p>{c.reason}</p>
                  </div>
                )
              })}
            </div>
          )}
          {run.noteIds.length > 0 && (
            <div className="fk-card hq-ver" style={{ marginBottom: 6 }}>
              {notes
                .filter((x) => x.runId === run.runId)
                .map((x) => (
                  <div key={x.id} className="hq-ver__row">
                    <span className="fk-tag fk-tag--draft">Note</span>{' '}
                    <button className="hq-textlink" onClick={() => onSelect(x.recordKey)}>
                      {title(x.recordKey)}
                    </button>
                    <p>{x.text}</p>
                  </div>
                ))}
            </div>
          )}
          <details className="pg-why" open={run.state === 'running'} style={{ padding: 0 }}>
            <summary>
              <Icon name="chev-down" />
              What it did ({run.steps.length} steps)
            </summary>
            <ol className="hq-run-steps">
              {run.steps.map((s, i) => (
                <li key={i} className={s.kind === 'error' ? 'is-error' : s.kind === 'text' ? 'is-text' : undefined}>
                  {s.kind === 'tool' ? <Icon name="chev" /> : s.kind === 'error' ? <Icon name="warning" /> : <Mark band="none" />}
                  <span>{s.text}</span>
                </li>
              ))}
            </ol>
          </details>
        </div>
      )}
    </Dialog>
  )
}
