// AI review: the key box, the run log, the summary and what it drafted. Plain components until the design
// handoff lands. Everything the AI produces is a suggestion; drafts are approved or discarded on each record.

import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import type { Project } from '@sciworks/shared'
import { db, type RecordRow } from '../db'
import { AI_MODEL, isRunning, requestStop } from '../lib/ai/agent'
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

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="AI review" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2>AI review</h2>
          <button className="btn btn-quiet" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>
        <p className="muted">
          Reads the records with the same checkers as the phones and <b>drafts</b> corrections and notes. It never changes a record: you approve,
          edit or discard every draft. Needs the internet; everything else in HQ works offline.
        </p>

        <div className="panel">
          <h3>Settings</h3>
          {key ? (
            <p>
              Key saved in this browser only: <code>{maskedKey(key)}</code>{' '}
              <button
                className="btn btn-quiet"
                onClick={() => {
                  forgetApiKey()
                  onKeyChanged()
                }}
              >
                Forget key
              </button>
            </p>
          ) : (
            <form
              className="row"
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
                <input type="password" autoComplete="off" spellCheck={false} value={draftKey} onChange={(e) => setDraftKey(e.target.value)} placeholder="sk-ant-…" />
              </label>
              <button className="btn btn-primary" type="submit">
                Save in this browser
              </button>
            </form>
          )}
          <p className="muted small">
            Kept only in this browser's storage: never in a file, a bundle, the HQ backup or a log. Model: <code>{AI_MODEL}</code>.
          </p>
          <label className="small inline">
            <input
              type="checkbox"
              checked={auto}
              onChange={(e) => {
                setAuto(e.target.checked)
                setAutoReview(e.target.checked)
              }}
            />{' '}
            Review automatically after each import
          </label>
        </div>

        <div className="detail-actions">
          <button className="btn btn-primary" onClick={onReviewAll} disabled={!key || !online || isRunning()}>
            Review everything not yet approved
          </button>
          {run?.state === 'running' && (
            <button className="btn" onClick={requestStop}>
              Stop
            </button>
          )}
        </div>
        {!online && <p className="error">No internet connection: the AI reviewer can't run now. The checks have already run on import.</p>}

        {run && (
          <div className="panel">
            <h3>
              {run.state === 'running' ? 'Reviewing…' : run.state === 'done' ? 'Last review' : run.state === 'stopped' ? 'Stopped' : 'Last review failed'}{' '}
              <span className="muted small">
                {shortTime(run.startedAt)} · {run.scopeKeys.length} records ({run.scopeLabel})
                {run.usage ? ` · ${run.usage.inputTokens.toLocaleString('en-GB')} in / ${run.usage.outputTokens.toLocaleString('en-GB')} out tokens` : ''}
              </span>
            </h3>
            {run.error && <p className="error">{run.error}</p>}
            {run.summary && (
              <div className="correction correction-draft">
                <p>
                  <span className="tag tag-ai">AI summary</span>
                </p>
                <p style={{ whiteSpace: 'pre-wrap' }}>{run.summary}</p>
              </div>
            )}
            {run.draftIds.length > 0 && (
              <>
                <h4>Drafted corrections</h4>
                <ul className="plain">
                  {run.draftIds.map((id) => {
                    const c = corrections.find((x) => x.correctionId === id)
                    const r = c ? byKey.get(c.recordKey) : undefined
                    if (!c) return null
                    return (
                      <li key={id}>
                        <span className="tag tag-ai">{c.state === 'draft' ? 'AI draft' : c.state === 'approved' ? '✓ approved' : 'discarded'}</span>{' '}
                        <button className="link" onClick={() => onSelect(c.recordKey)}>
                          {r ? recordTitle(r) : c.recordKey}
                        </button>
                        : <code>{c.fieldPath}</code> {fmtValue(c.current)} → <b>{fmtValue(c.proposed)}</b>. <span className="muted">{c.reason}</span>
                      </li>
                    )
                  })}
                </ul>
              </>
            )}
            {run.noteIds.length > 0 && (
              <>
                <h4>Notes</h4>
                <ul className="plain">
                  {notes
                    .filter((x) => x.runId === run.runId)
                    .map((x) => (
                      <li key={x.id}>
                        <button className="link" onClick={() => onSelect(x.recordKey)}>
                          {byKey.get(x.recordKey) ? recordTitle(byKey.get(x.recordKey)!) : x.recordKey}
                        </button>
                        : {x.text}
                      </li>
                    ))}
                </ul>
              </>
            )}
            <details open={run.state === 'running'}>
              <summary className="small">What it did ({run.steps.length} steps)</summary>
              <ol className="plain small">
                {run.steps.map((s, i) => (
                  <li key={i} className={s.kind === 'error' ? 'error' : s.kind === 'text' ? 'muted' : ''}>
                    {s.kind === 'tool' ? '→ ' : s.kind === 'error' ? '⚠ ' : ''}
                    {s.text}
                  </li>
                ))}
              </ol>
            </details>
          </div>
        )}
      </div>
    </div>
  )
}
