// HQ: ONE main screen. Queue on the left, map in the middle, record detail on the right.
// Plain components for now: the Impeccable design pass (Sunday morning) owns the look.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { CONTRACT_VERSION } from '@sciworks/shared'
import { db, type ImportSummary } from './db'
import { Detail } from './components/Detail'
import { MapView } from './components/MapView'
import { DEFAULT_FILTER, Queue, applyFilter, sortRows, type QueueFilter } from './components/Queue'
import { DevicesPanel, ExportDialog, HqBundleDialog } from './components/Dialogs'
import { AiPanel } from './components/AiPanel'
import { runReview, scopeToReview } from './lib/ai/agent'
import { getApiKey, getAutoReview } from './lib/ai/apiKey'
import { loadDemoProject, loadSampleFieldBundle } from './lib/demo'
import { download, makeBackup } from './lib/files'
import { importBundleFile, summaryLine } from './lib/importBundle'
import { setStatus } from './lib/review'
import { dataManagerOf, loadSetup } from './lib/setup'

type Dialog = 'none' | 'hq-bundle' | 'export' | 'devices' | 'ai'

export default function App() {
  const setup = useLiveQuery(() => loadSetup(), [], undefined)
  const records = useLiveQuery(() => db.records.toArray(), [], [])
  const corrections = useLiveQuery(() => db.corrections.toArray(), [], [])
  const overlays = useLiveQuery(() => db.overlays.toArray(), [], [])
  const provisional = useLiveQuery(() => db.provisionalTaxa.toArray(), [], [])
  const quarantined = useLiveQuery(() => db.quarantine.toArray(), [], [])
  const aiNotes = useLiveQuery(() => db.aiNotes.toArray(), [], [])
  const lastRun = useLiveQuery(() => db.aiRuns.orderBy('startedAt').last(), [], undefined)

  const [filter, setFilter] = useState<QueueFilter>(DEFAULT_FILTER)
  const [selectedKey, setSelectedKey] = useState<string>()
  const [correctionOpen, setCorrectionOpen] = useState(false)
  const [dialog, setDialog] = useState<Dialog>('none')
  const [imports, setImports] = useState<ImportSummary[]>([])
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDetailsElement>(null)
  const [keyVersion, setKeyVersion] = useState(0)
  const [aiMessage, setAiMessage] = useState('')

  const project = setup?.project
  const me = dataManagerOf(project)
  const provisionalNames = useMemo(() => new Map(provisional.map((p) => [p.provisionalTaxonId, p.data.proposedName])), [provisional])
  const visible = useMemo(() => sortRows(applyFilter(records, filter, corrections)), [records, filter, corrections])
  const selected = records.find((r) => r.key === selectedKey)
  // Incomplete records not yet received in a complete version.
  const held = useMemo(() => {
    const have = new Set(records.map((r) => r.key))
    return new Set(quarantined.filter((x) => x.recordKey && !have.has(x.recordKey)).map((x) => x.recordKey)).size
  }, [records, quarantined])
  const overlayFor = (teamId?: string) => overlays.filter((o) => o.teamId === teamId).sort((a, b) => b.overlayRev - a.overlayRev)[0]?.data

  // Ask the browser to keep HQ's data even when the disk fills up (first run).
  useEffect(() => {
    navigator.storage?.persist?.().catch(() => undefined)
  }, [])

  /** The AI reviewer. It only drafts; failures (no key, no internet) are said plainly and nothing else stops. */
  const review = useCallback(async (keys?: string[]) => {
    const scope = await scopeToReview(keys)
    if (!scope.keys.length) return
    setAiMessage('')
    const out = await runReview(scope, { apiKey: getApiKey() })
    if (!out.ok) setAiMessage(out.message)
  }, [])

  const afterImport = useCallback(
    (summaries: ImportSummary[]) => {
      const keys = summaries.flatMap((s) => (s.ok && s.kind === 'field' ? (s.changedKeys ?? []) : []))
      if (!keys.length || !getAutoReview()) return
      if (!getApiKey()) {
        setAiMessage('AI review is off: add an Anthropic API key in AI review to have new records checked automatically.')
        return
      }
      void review(keys)
    },
    [review],
  )

  const runImport = useCallback(async (files: File[]) => {
    setBusy(true)
    const out: ImportSummary[] = []
    for (const f of files) {
      try {
        out.push(await importBundleFile(new Uint8Array(await f.arrayBuffer()), f.name))
      } catch (err) {
        out.push({ fileName: f.name, ok: false, error: (err as Error).message, alreadyHadFile: false, newRecords: 0, updatedRecords: 0, duplicates: 0, olderRevs: 0, editedAfterReview: 0, newPhotos: 0, newProvisionalTaxa: 0, newChangeRequests: 0, newCorrectionResponses: 0, heldAside: 0, badFiles: [] })
      }
    }
    setImports((prev) => [...out, ...prev].slice(0, 6))
    setBusy(false)
    afterImport(out)
  }, [afterImport])

  const runOne = async (fn: () => Promise<ImportSummary>) => {
    setBusy(true)
    try {
      const s = await fn()
      setImports((prev) => [s, ...prev].slice(0, 6))
      afterImport([s])
    } finally {
      setBusy(false)
    }
  }

  // Drag a bundle anywhere onto the window.
  useEffect(() => {
    const over = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('Files')) return
      e.preventDefault()
      setDragging(true)
    }
    const leave = (e: DragEvent) => {
      if (e.relatedTarget === null) setDragging(false)
    }
    const drop = (e: DragEvent) => {
      e.preventDefault()
      setDragging(false)
      const files = [...(e.dataTransfer?.files ?? [])]
      if (files.length) runImport(files)
    }
    window.addEventListener('dragover', over)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragover', over)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('drop', drop)
    }
  }, [runImport])

  // Latest values for key presses that arrive faster than React re-renders.
  const live = useRef({ selectedKey, visible, records })
  live.current = { selectedKey, visible, records }
  const pick = (key?: string) => {
    live.current.selectedKey = key
    setSelectedKey(key)
  }

  const selectOffset = useCallback(
    (delta: number) => {
      if (!visible.length) return
      const i = visible.findIndex((r) => r.key === live.current.selectedKey)
      const next = i < 0 ? 0 : Math.min(visible.length - 1, Math.max(0, i + delta))
      pick(visible[next]!.key)
      setCorrectionOpen(false)
    },
    [visible],
  )

  /** Approve or reject, then move to the next record still in the list: one keystroke per record. */
  const decide = useCallback(
    async (status: 'approved' | 'rejected' | 'received') => {
      // Everything up to the write is synchronous, so a fast second key press acts on the NEXT record.
      const { selectedKey: key, visible: rows, records: all } = live.current
      const row = all.find((r) => r.key === key)
      if (!row || row.status === status) return
      let note: string | undefined
      if (status === 'rejected') {
        const answer = window.prompt('Reject this record? Say why (kept, never exported):', '')
        if (answer === null) return
        note = answer || undefined
      }
      live.current.records = all.map((r) => (r.key === row.key ? { ...r, status } : r))
      const i = rows.findIndex((r) => r.key === row.key)
      const now = new Map(live.current.records.map((r) => [r.key, r.status]))
      const after = rows
        .slice(i + 1)
        .concat(rows.slice(0, Math.max(0, i)))
        .find((r) => r.key !== row.key && now.get(r.key) !== status)
      const stillVisible = status === 'received' || filter.status === 'all' || filter.status === status
      if (!stillVisible && after) pick(after.key)
      setCorrectionOpen(false)
      await setStatus(row.key, status, { by: me.personId, note })
    },
    [me.personId, filter.status],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.closest('input, textarea, select, [contenteditable]') || e.metaKey || e.ctrlKey || e.altKey) return
      if (dialog !== 'none') return
      const k = e.key.toLowerCase()
      if (k === 'arrowdown' || k === 'j') (e.preventDefault(), selectOffset(1))
      else if (k === 'arrowup' || k === 'k') (e.preventDefault(), selectOffset(-1))
      else if (k === 'a') (e.preventDefault(), decide('approved'))
      else if (k === 'r') (e.preventDefault(), decide('rejected'))
      else if (k === 'c' && selected) (e.preventDefault(), setCorrectionOpen(true))
      else if (k === 'escape') setCorrectionOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectOffset, decide, selected, dialog])

  // Close the More menu when clicking anywhere else.
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) menuRef.current.removeAttribute('open')
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [])

  const counts = useMemo(() => {
    const c = { toReview: 0, flagged: 0, approved: 0 }
    for (const r of records) {
      if (r.voided) continue
      if (r.status === 'approved') c.approved++
      else if (r.status !== 'rejected') c.toReview++
      if (r.status === 'flagged') c.flagged++
    }
    return c
  }, [records])

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <strong>HQ</strong>
          <span className="muted">{project ? project.name : 'No project loaded'}</span>
        </div>
        <div className="topbar-stats" aria-live="polite">
          <span>{counts.toReview} to review</span>
          <span>⚑ {counts.flagged} flagged</span>
          <span>✓ {counts.approved} approved</span>
        </div>
        <nav className="topbar-actions">
          <input ref={fileInput} type="file" accept=".zip,application/zip" multiple hidden onChange={(e) => (runImport([...(e.target.files ?? [])]), (e.target.value = ''))} />
          <button className="btn btn-primary" onClick={() => fileInput.current?.click()} disabled={busy}>
            Import bundle
          </button>
          <button className="btn" onClick={() => setDialog('hq-bundle')} disabled={!project}>
            Make HQ bundle
          </button>
          <button className="btn" onClick={() => setDialog('export')} disabled={!project}>
            Export Darwin Core
          </button>
          <button className="btn" onClick={() => setDialog('ai')} disabled={!project} title="AI reviewer: drafts only; you decide">
            {lastRun?.state === 'running' ? 'AI reviewing…' : 'AI review'}
          </button>
          <button className="btn" onClick={() => setDialog('devices')}>
            Devices
          </button>
          <details className="menu" ref={menuRef} onClick={(e) => (e.target as HTMLElement).tagName === 'BUTTON' && menuRef.current?.removeAttribute('open')}>
            <summary className="btn btn-quiet">More</summary>
            <div className="menu-body">
              <button className="btn btn-quiet" onClick={() => runOne(loadDemoProject)} disabled={busy}>
                Load demo project
              </button>
              <button className="btn btn-quiet" onClick={() => runOne(loadSampleFieldBundle)} disabled={busy || !project}>
                Import sample Field bundle
              </button>
              <button
                className="btn btn-quiet"
                onClick={async () => {
                  const b = await makeBackup()
                  download(b.bytes, b.fileName)
                }}
              >
                Export HQ backup
              </button>
              <p className="muted small">Contract {CONTRACT_VERSION}</p>
            </div>
          </details>
        </nav>
      </header>

      {imports.length > 0 && (
        <div className="imports" role="status">
          {imports.slice(0, 3).map((s, i) => (
            <div key={i} className={`import ${s.ok ? '' : 'import-bad'}`}>
              <b>{s.fileName}</b>: {summaryLine(s)}
              {s.badFiles.length > 0 && (
                <ul className="plain small">
                  {s.badFiles.map((b) => (
                    <li key={b.path}>
                      ⚠ <code>{b.path}</code>: {b.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
          <button className="btn btn-quiet small" onClick={() => setImports([])}>
            Dismiss
          </button>
        </div>
      )}

      {(aiMessage || lastRun) && (
        <div className="imports" role="status">
          {lastRun?.state === 'running' ? (
            <span>
              <span className="tag tag-ai">AI</span> Reviewing {lastRun.scopeKeys.length} records… {lastRun.steps[lastRun.steps.length - 1]?.text ?? 'starting'}
            </span>
          ) : aiMessage ? (
            <span>
              <span className="tag tag-ai">AI</span> {aiMessage}
            </span>
          ) : lastRun ? (
            <span>
              <span className="tag tag-ai">AI</span>{' '}
              {lastRun.state === 'done'
                ? `Review finished: ${lastRun.draftIds.length} draft correction${lastRun.draftIds.length === 1 ? '' : 's'} and ${lastRun.noteIds.length} note${lastRun.noteIds.length === 1 ? '' : 's'} waiting for you.`
                : lastRun.state === 'stopped'
                  ? 'Review stopped.'
                  : `Review failed: ${lastRun.error ?? ''}`}{' '}
              <button className="link" onClick={() => setDialog('ai')}>
                Open AI review
              </button>
            </span>
          ) : null}
        </div>
      )}

      {!project ? (
        <main className="empty-state">
          <h1>Set up HQ</h1>
          <p>Load the project set-up first: the form, the transects and the species pack.</p>
          <button className="btn btn-primary" onClick={() => runOne(loadDemoProject)} disabled={busy}>
            Load demo project (Costa Rica, La Selva)
          </button>
          <p className="muted small">Illustrative demo data, not for field ID.</p>
        </main>
      ) : (
        <main className="workspace">
          <Queue
            project={project}
            rows={visible}
            total={records.length}
            filter={filter}
            onFilter={setFilter}
            selectedKey={selectedKey}
            onSelect={(k) => (setSelectedKey(k), setCorrectionOpen(false))}
            drafts={corrections}
            provisionalNames={provisionalNames}
            held={held}
            noteKeys={new Set(aiNotes.filter((x) => !x.dismissed).map((x) => x.recordKey))}
          />
          <MapView transects={setup?.transects} records={records.filter((r) => !r.voided)} selectedKey={selectedKey} onSelect={(k) => (setSelectedKey(k), setCorrectionOpen(false))} />
          <Detail
            row={selected}
            project={project}
            templates={setup?.templates ?? []}
            overlay={overlayFor(selected?.teamId)}
            corrections={corrections}
            provisionalNames={provisionalNames}
            me={me.personId}
            onApprove={() => decide('approved')}
            onReject={() => decide('rejected')}
            onReopen={() => decide('received')}
            correctionOpen={correctionOpen}
            setCorrectionOpen={setCorrectionOpen}
            aiNotes={aiNotes.filter((x) => x.recordKey === selected?.key && !x.dismissed)}
          />
        </main>
      )}

      {dragging && (
        <div className="dropzone" aria-hidden>
          Drop Field bundles to import. Re-sends are safe: nothing is duplicated.
        </div>
      )}
      {dialog === 'hq-bundle' && project && <HqBundleDialog project={project} onClose={() => setDialog('none')} />}
      {dialog === 'export' && project && setup && <ExportDialog setup={setup} onClose={() => setDialog('none')} onSelect={(k) => (setSelectedKey(k), setDialog('none'))} />}
      {dialog === 'devices' && <DevicesPanel project={project} onClose={() => setDialog('none')} />}
      {dialog === 'ai' && (
        <AiPanel
          project={project}
          onClose={() => setDialog('none')}
          onSelect={(k) => (pick(k), setDialog('none'))}
          onReviewAll={() => void review()}
          keyVersion={keyVersion}
          onKeyChanged={() => setKeyVersion((v) => v + 1)}
        />
      )}
    </div>
  )
}
