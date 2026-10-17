// Fieldkit HQ (wireframe H1): ONE main screen. The QA queue on the left, the map in the middle (widest), the record
// on the right. Form control and "Check a list of points" replace the three columns when chosen from the top bar.
// Look: the Fieldkit kit (./kit/fieldkit.css), Option E · Clean.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { CONTRACT_VERSION } from '@sciworks/shared'
import { currentDbName, db, type ImportSummary } from './db'
import { AiPanel } from './components/AiPanel'
import { Detail } from './components/Detail'
import { DevicesPanel, ExportDialog, HqBundleDialog } from './components/Dialogs'
import { FormScreen } from './components/FormScreen'
import { MapView, type MapLayerChoice } from './components/MapView'
import { PointsScreen } from './components/PointsScreen'
import { DEFAULT_FILTER, Queue, applyFilter, sortRows, type QueueFilter } from './components/Queue'
import { Icon, Sprite } from './kit/Icons'
import { Rail } from './kit/Rail'
import { runReview, scopeToReview } from './lib/ai/agent'
import { getApiKey, getAutoReview } from './lib/ai/apiKey'
import { loadDemoProject, loadSampleFieldBundle } from './lib/demo'
import { download, makeBackup } from './lib/files'
import { importBundleFile, summaryLine } from './lib/importBundle'
import { setStatus } from './lib/review'
import { listFolders, newFolder, openFolder, rememberProject } from './lib/projects'
import { dataManagerOf, loadSetup, teamName } from './lib/setup'
import { recordTitle, STATUS_ICON, STATUS_WORD } from './lib/format'
import { shortTime } from './lib/time'

/** Satellite or plain under the map lines: a per-browser convenience only. */
const MAP_LAYER_KEY = 'sciworks-hq.map-layer'
/** Which side panels are folded to a rail: a per-browser convenience only. */
const PANELS_KEY = 'sciworks-hq.panels'
/** Set before opening a new project folder that should start with the demo set-up. */
const AFTER_OPEN_KEY = 'sciworks-hq.after-open'

type Dialog = 'none' | 'hq-bundle' | 'export' | 'devices' | 'ai'
type View = 'review' | 'form' | 'points'

const failed = (fileName: string, error: string): ImportSummary => ({
  fileName,
  ok: false,
  error,
  alreadyHadFile: false,
  newRecords: 0,
  updatedRecords: 0,
  duplicates: 0,
  olderRevs: 0,
  editedAfterReview: 0,
  newPhotos: 0,
  newProvisionalTaxa: 0,
  newChangeRequests: 0,
  newCorrectionResponses: 0,
  heldAside: 0,
  badFiles: [],
})

export default function App() {
  const setup = useLiveQuery(() => loadSetup(), [], undefined)
  const records = useLiveQuery(() => db.records.toArray(), [], [])
  const corrections = useLiveQuery(() => db.corrections.toArray(), [], [])
  const overlays = useLiveQuery(() => db.overlays.toArray(), [], [])
  const provisional = useLiveQuery(() => db.provisionalTaxa.toArray(), [], [])
  const quarantined = useLiveQuery(() => db.quarantine.toArray(), [], [])
  const aiNotes = useLiveQuery(() => db.aiNotes.toArray(), [], [])
  const devices = useLiveQuery(() => db.devices.toArray(), [], [])
  const lastRun = useLiveQuery(() => db.aiRuns.orderBy('startedAt').last(), [], undefined)
  const basemaps = useLiveQuery(() => db.basemaps.toArray(), [], [])
  const [mapLayer, setMapLayer] = useState<MapLayerChoice>(() => {
    try {
      return localStorage.getItem(MAP_LAYER_KEY) === 'plain' ? 'plain' : 'satellite'
    } catch {
      return 'satellite'
    }
  })
  const chooseMapLayer = (l: MapLayerChoice) => {
    setMapLayer(l)
    try {
      localStorage.setItem(MAP_LAYER_KEY, l)
    } catch {
      /* the choice just isn't remembered */
    }
  }
  // Team requests waiting for a decision: species added in the field, and form requests.
  const pendingRequests = useLiveQuery(
    async () => {
      const decidedTaxa = new Set((await db.taxonDecisions.toArray()).map((t) => t.provisionalTaxonId))
      const decidedCrs = new Set((await db.changeRequestDecisions.toArray()).map((c) => c.changeRequestId))
      const draft = (await db.setup.get('templateDraft'))?.value as { acceptedRequestIds?: string[] } | undefined
      const inDraft = new Set(draft?.acceptedRequestIds ?? [])
      const taxa = (await db.provisionalTaxa.toArray()).filter((p) => !decidedTaxa.has(p.provisionalTaxonId)).length
      const crs = (await db.changeRequests.toArray()).filter((c) => !decidedCrs.has(c.changeRequestId) && !inDraft.has(c.changeRequestId)).length
      return taxa + crs
    },
    [],
    0,
  )

  const [view, setView] = useState<View>('review')
  const [filter, setFilter] = useState<QueueFilter>(DEFAULT_FILTER)
  const [selectedKey, setSelectedKey] = useState<string>()
  const [correctionOpen, setCorrectionOpen] = useState(false)
  const [dialog, setDialog] = useState<Dialog>('none')
  const [imports, setImports] = useState<ImportSummary[]>([])
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDetailsElement>(null)
  const projRef = useRef<HTMLDetailsElement>(null)
  const [panels, setPanels] = useState<{ queue: boolean; record: boolean }>(() => {
    try {
      const v = JSON.parse(localStorage.getItem(PANELS_KEY) ?? '{}')
      return { queue: v.queue !== false, record: v.record !== false }
    } catch {
      return { queue: true, record: true }
    }
  })
  const togglePanel = useCallback((side: 'queue' | 'record') => {
    setPanels((p) => {
      const next = { ...p, [side]: !p[side] }
      try {
        localStorage.setItem(PANELS_KEY, JSON.stringify(next))
      } catch {
        /* the choice just isn't remembered */
      }
      return next
    })
  }, [])
  const [keyVersion, setKeyVersion] = useState(0)
  const [aiMessage, setAiMessage] = useState('')
  const [aiStripHidden, setAiStripHidden] = useState(false)

  const project = setup?.project
  const me = dataManagerOf(project)
  const provisionalNames = useMemo(() => new Map(provisional.map((p) => [p.provisionalTaxonId, p.data.proposedName])), [provisional])
  const venomous = useMemo(() => new Set((setup?.speciesPack?.taxa ?? []).filter((t) => t.dangerous).map((t) => t.taxonId)), [setup?.speciesPack])
  const visible = useMemo(() => sortRows(applyFilter(records, filter, corrections)), [records, filter, corrections])
  const selected = records.find((r) => r.key === selectedKey)
  // Incomplete records not yet received in a complete version.
  const held = useMemo(() => {
    const have = new Set(records.map((r) => r.key))
    return new Set(quarantined.filter((x) => x.recordKey && !have.has(x.recordKey)).map((x) => x.recordKey)).size
  }, [records, quarantined])
  const overlayFor = (teamId?: string) => overlays.filter((o) => o.teamId === teamId).sort((a, b) => b.overlayRev - a.overlayRev)[0]?.data

  // The project menu shows each folder by its project's name.
  useEffect(() => rememberProject(setup?.project), [setup?.project])

  // Ask the browser to keep HQ's data even when the disk fills up (first run).
  useEffect(() => {
    navigator.storage?.persist?.().catch(() => undefined)
  }, [])

  /** The AI reviewer. It only drafts; failures (no key, no internet) are said plainly and nothing else stops. */
  const review = useCallback(async (keys?: string[]) => {
    const scope = await scopeToReview(keys)
    if (!scope.keys.length) return
    setAiMessage('')
    setAiStripHidden(false)
    const out = await runReview(scope, { apiKey: getApiKey() })
    if (!out.ok) setAiMessage(out.message)
  }, [])

  const afterImport = useCallback(
    (summaries: ImportSummary[]) => {
      const keys = summaries.flatMap((s) => (s.ok && s.kind === 'field' ? (s.changedKeys ?? []) : []))
      if (!keys.length || !getAutoReview()) return
      if (!getApiKey()) {
        setAiStripHidden(false)
        setAiMessage('off. Add a key in AI reviewer to check new records.')
        return
      }
      void review(keys)
    },
    [review],
  )

  const runImport = useCallback(
    async (files: File[]) => {
      setBusy(true)
      const out: ImportSummary[] = []
      for (const f of files) {
        try {
          out.push(await importBundleFile(new Uint8Array(await f.arrayBuffer()), f.name))
        } catch (err) {
          out.push(failed(f.name, (err as Error).message))
        }
      }
      setImports((prev) => [...out, ...prev].slice(0, 6))
      setBusy(false)
      setView('review')
      afterImport(out)
    },
    [afterImport],
  )

  const runOne = async (fn: () => Promise<ImportSummary>) => {
    setBusy(true)
    try {
      const s = await fn()
      setImports((prev) => [s, ...prev].slice(0, 6))
      setView('review')
      afterImport([s])
    } finally {
      setBusy(false)
    }
  }

  // A new project folder opened from "Example projects" starts with the demo set-up.
  useEffect(() => {
    if (setup === undefined || setup.project) return
    let flag: string | null = null
    try {
      flag = localStorage.getItem(AFTER_OPEN_KEY)
      localStorage.removeItem(AFTER_OPEN_KEY)
    } catch {
      /* nothing to do */
    }
    if (flag === 'demo') runOne(loadDemoProject)
  }, [setup]) // eslint-disable-line react-hooks/exhaustive-deps

  const folders = listFolders()
  const currentFolder = currentDbName()
  const openExample = () => {
    const had = folders.find((f) => f.projectId === 'cr-herps')
    if (had) return had.dbName === currentFolder ? undefined : openFolder(had.dbName)
    if (!project) return void runOne(loadDemoProject)
    try {
      localStorage.setItem(AFTER_OPEN_KEY, 'demo')
    } catch {
      /* it opens empty instead */
    }
    newFolder()
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
      if (dialog !== 'none' || view !== 'review') return
      const k = e.key.toLowerCase()
      if (k === 'arrowdown' || k === 'j') (e.preventDefault(), selectOffset(1))
      else if (k === 'arrowup' || k === 'k') (e.preventDefault(), selectOffset(-1))
      else if (k === 'a') (e.preventDefault(), decide('approved'))
      else if (k === 'r') (e.preventDefault(), decide('rejected'))
      else if (k === 'c' && selected) (e.preventDefault(), setCorrectionOpen(true))
      else if (k === 'escape') setCorrectionOpen(false)
      else if (k === '[') (e.preventDefault(), togglePanel('queue'))
      else if (k === ']') (e.preventDefault(), togglePanel('record'))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectOffset, decide, selected, dialog, view, togglePanel])

  // Close the More and project menus when clicking anywhere else.
  useEffect(() => {
    const close = (e: MouseEvent) => {
      for (const m of [menuRef.current, projRef.current]) if (m && !m.contains(e.target as Node)) m.removeAttribute('open')
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [])

  const stats = useMemo(() => {
    const c = { toReview: 0, flagged: 0, approved: 0 }
    for (const r of records) {
      if (r.voided) continue
      if (r.status === 'approved') c.approved++
      else if (r.status !== 'rejected') c.toReview++
      if (r.status === 'flagged') c.flagged++
    }
    return c
  }, [records])

  // The selected record's team, for the map's corner: when its phones last handed over.
  const counter = useMemo(() => {
    const teamId = selected?.teamId ?? records[0]?.teamId
    const devs = devices.filter((d) => d.teamId === teamId)
    if (!teamId || !devs.length) return undefined
    const last = devs.map((d) => d.lastBundleAt).sort().pop()!
    return {
      team: teamName(project, teamId),
      line: 'Last handover',
      sub: devs.length > 1 ? `${shortTime(last)} · ${devs.length} phones` : shortTime(last),
    }
  }, [selected?.teamId, records, devices, project])

  const latest = imports[0]
  const showAi = !aiStripHidden && (aiMessage || lastRun)
  const strips = !!project && view === 'review' && (!!latest || !!showAi)
  const menuItem = (icon: Parameters<typeof Icon>[0]['name'], label: string, onClick: () => void, disabled = false) => (
    <button className="fk-row" onClick={onClick} disabled={disabled}>
      <Icon name={icon} />
      {label}
    </button>
  )

  return (
    <div className={`fk-hq hq-app${strips ? '' : ' hq-noimport'}`}>
      <Sprite />
      <header className="fk-top">
        <button className="fk-brand hq-home" onClick={() => setView('review')}>
          Fieldkit HQ
        </button>
        <details className="hq-menu hq-projmenu" ref={projRef} onClick={(e) => (e.target as HTMLElement).closest('button') && projRef.current?.removeAttribute('open')}>
          <summary className="fk-proj hq-proj" aria-label={`Project: ${project ? project.name : 'none loaded'}. Open the project list`}>
            <Icon name="folder" />
            {project ? project.name : 'No project loaded'}
            <Icon name="chev-down" className="hq-proj__chev" />
          </summary>
          <div className="hq-menu__body hq-menu__body--left fk-list">
            <p className="hq-menu__head">Project folders on this laptop</p>
            {folders.map((f) => (
              <button
                key={f.dbName}
                className="fk-row"
                aria-current={f.dbName === currentFolder ? 'true' : undefined}
                onClick={() => f.dbName !== currentFolder && openFolder(f.dbName)}
              >
                <Icon name="folder" />
                <span className="hq-menu__name">
                  {f.dbName === currentFolder && project ? project.name : (f.name ?? 'New project (not set up yet)')}
                  <small>{f.dbName === currentFolder ? `Open now · ${records.length} record${records.length === 1 ? '' : 's'}` : 'Opens this folder'}</small>
                </span>
                {f.dbName === currentFolder && <Icon name="check" className="hq-menu__on" />}
              </button>
            ))}
            <p className="hq-menu__head">Example projects</p>
            <button className="fk-row" onClick={openExample}>
              <Icon name="tree" />
              <span className="hq-menu__name">
                Costa Rica herp transects
                <small>
                  La Selva · 3 transects ·{' '}
                  {(() => {
                    const had = folders.find((f) => f.projectId === 'cr-herps')
                    return had ? (had.dbName === currentFolder ? 'open now' : 'opens its folder') : project ? 'opens as a new folder' : 'loads here'
                  })()}
                </small>
              </span>
            </button>
            <div className="hq-menu__sep" />
            {menuItem('plus', 'New project folder', newFolder)}
          </div>
        </details>
        <span className="fk-spacer" />
        {view !== 'review' && project && (
          <button className="fk-btn fk-btn--grey fk-btn--36" onClick={() => setView('review')}>
            <Icon name="tray" />
            QA queue
          </button>
        )}
        <button className={`fk-btn fk-btn--grey fk-btn--36${view === 'form' ? ' pg-cur' : ''}`} aria-current={view === 'form' ? 'page' : undefined} onClick={() => setView(view === 'form' ? 'review' : 'form')} disabled={!project}>
          <Icon name="survey" />
          Form
          {pendingRequests > 0 && <span className="hq-count-badge" aria-label={`${pendingRequests} team requests waiting`}>{pendingRequests}</span>}
        </button>
        {(
          [
            ['ai', 'reviewer', lastRun?.state === 'running' ? 'AI reviewer · reviewing…' : 'AI reviewer'],
            ['hq-bundle', 'send', 'Make bundle for a team'],
            ['export', 'download', 'Export Darwin Core · approved records'],
            ['devices', 'phone', 'Devices'],
          ] as const
        ).map(([d, icon, tip]) => (
          <button
            key={d}
            className={`fk-btn fk-btn--grey fk-btn--36 fk-btn--icon hq-tip${dialog === d ? ' pg-cur' : ''}`}
            aria-current={dialog === d ? 'page' : undefined}
            aria-label={tip}
            data-tip={tip}
            onClick={() => setDialog(d)}
            disabled={d !== 'devices' && !project}
          >
            <Icon name={icon} />
            {d === 'ai' && lastRun?.state === 'running' && <span className="hq-busy-dot" aria-hidden="true" />}
          </button>
        ))}
        <details className="hq-menu" ref={menuRef} onClick={(e) => (e.target as HTMLElement).closest('button') && menuRef.current?.removeAttribute('open')}>
          <summary className="fk-btn fk-btn--grey fk-btn--36 fk-btn--icon hq-tip" aria-label="More" data-tip="More">
            <Icon name="more" />
          </summary>
          <div className="hq-menu__body fk-list">
            {menuItem('crosshair', 'Check a list of points', () => setView('points'), !project)}
            {menuItem('bundle', 'Import sample Field bundle', () => runOne(loadSampleFieldBundle), busy || !project)}
            {menuItem('folder', 'Load demo project', () => runOne(loadDemoProject), busy)}
            {menuItem('download', 'Export HQ backup', async () => {
              const b = await makeBackup()
              download(b.bytes, b.fileName)
            })}
            <p className="hq-menu__foot">Shared contract {CONTRACT_VERSION}</p>
          </div>
        </details>
        <input ref={fileInput} type="file" accept=".zip,application/zip" multiple hidden onChange={(e) => (runImport([...(e.target.files ?? [])]), (e.target.value = ''))} />
        <button className={`fk-btn fk-btn--36 ${project ? 'fk-btn--primary' : 'fk-btn--grey'}`} onClick={() => fileInput.current?.click()} disabled={busy}>
          <Icon name="bundle" />
          Import bundle
        </button>
      </header>

      {strips && (
        <div className="hq-strips">
          <div className={`fk-import${latest && !latest.ok ? ' is-bad' : ''}`} role="status">
            <Icon name={latest ? (latest.ok ? 'bundle' : 'warning') : 'reviewer'} />
            <span className="fk-import__text">
              {latest && (
                <>
                  <b>{latest.fileName}</b>: {summaryLine(latest)}
                  {latest.badFiles.length > 0 && (
                    <ul>
                      {latest.badFiles.map((b) => (
                        <li key={b.path}>
                          <b>{b.path}</b>: {b.message}
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
              {showAi && (
                <span className="hq-ai-line">
                  <Icon name="reviewer" />
                  AI reviewer:{' '}
                  {lastRun?.state === 'running' && !aiMessage
                    ? `reviewing ${lastRun.scopeKeys.length} records… ${lastRun.steps[lastRun.steps.length - 1]?.text ?? 'starting'}`
                    : aiMessage
                      ? aiMessage
                      : lastRun?.state === 'done'
                        ? `finished. ${lastRun.draftIds.length} draft correction${lastRun.draftIds.length === 1 ? '' : 's'} and ${lastRun.noteIds.length} note${lastRun.noteIds.length === 1 ? '' : 's'} waiting for you.`
                        : lastRun?.state === 'stopped'
                          ? 'stopped.'
                          : `the review failed. ${lastRun?.error ?? ''}`}{' '}
                  <button className="hq-textlink" onClick={() => setDialog('ai')}>
                    Open
                  </button>
                </span>
              )}
            </span>
            <button
              className="fk-btn fk-btn--secondary fk-btn--36"
              onClick={() => {
                setImports([])
                setAiStripHidden(true)
              }}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {!project ? (
        <main className="hq-setup">
          <div className="fk-group">
            <div className="fk-card hq-setup__card">
              <span className="fk-tile">
                <Icon name="folder" />
              </span>
              <h2>Set up HQ</h2>
              <p>Load the project set-up first: the form, the transects and the species pack.</p>
              <button className="fk-btn fk-btn--primary fk-btn--48" onClick={() => runOne(loadDemoProject)} disabled={busy}>
                Load demo project (Costa Rica, La Selva)
              </button>
              <p className="fk-small">Illustrative demo data, not for field ID.</p>
            </div>
          </div>
        </main>
      ) : view === 'form' ? (
        <FormScreen project={project} template={setup?.template} me={me.personId} />
      ) : view === 'points' ? (
        <PointsScreen project={project} />
      ) : (
        <main className={`fk-cols hq-cols${panels.queue ? '' : ' hq-q-rail'}${panels.record ? '' : ' hq-r-rail'}`}>
          {panels.queue ? (
            <Queue
              onFold={() => togglePanel('queue')}
              project={project}
              rows={visible}
              total={records.length}
              filter={filter}
              onFilter={setFilter}
              selectedKey={selectedKey}
              onSelect={(k) => (pick(k), setCorrectionOpen(false))}
              drafts={corrections}
              provisionalNames={provisionalNames}
              held={held}
              noteKeys={new Set(aiNotes.filter((x) => !x.dismissed).map((x) => x.recordKey))}
              venomous={venomous}
              stats={stats}
            />
          ) : (
            <Rail side="left" label="QA queue" keyHint="[" onOpen={() => togglePanel('queue')}>
              <span className="hq-rail__n" title="To review">
                <Icon name="tray" />
                <b>{stats.toReview}</b>
              </span>
              {stats.flagged > 0 && (
                <span className="hq-rail__n is-flag" title="Flagged">
                  <Icon name="flag" />
                  <b>{stats.flagged}</b>
                </span>
              )}
            </Rail>
          )}
          <section className="fk-col" aria-label="Map">
            <div className="fk-col-h">
              <h3>Map</h3>
              <span>
                {!basemaps.length
                  ? 'All teams · no satellite picture'
                  : mapLayer === 'satellite'
                    ? `All teams · Satellite · ${basemaps.map((b) => b.meta.name.replace(/^Satellite \((.*)\)$/, '$1')).join(', ')}`
                    : 'All teams · Plain'}
              </span>
            </div>
            <div className="fk-group" style={{ flex: 1, minHeight: 0 }}>
              <MapView
                transects={setup?.transects}
                records={records.filter((r) => !r.voided)}
                selectedKey={selectedKey}
                onSelect={(k) => (pick(k), setCorrectionOpen(false))}
                counter={counter}
                basemaps={basemaps}
                layer={mapLayer}
                onLayer={chooseMapLayer}
              />
            </div>
          </section>
          {panels.record ? (
            <Detail
              onFold={() => togglePanel('record')}
              row={selected}
              project={project}
              templates={setup?.templates ?? []}
              overlay={overlayFor(selected?.teamId)}
              corrections={corrections}
              provisionalNames={provisionalNames}
              speciesPack={setup?.speciesPack}
              me={me.personId}
              onApprove={() => decide('approved')}
              onReject={() => decide('rejected')}
              onReopen={() => decide('received')}
              correctionOpen={correctionOpen}
              setCorrectionOpen={setCorrectionOpen}
              aiNotes={aiNotes.filter((x) => x.recordKey === selected?.key && !x.dismissed)}
            />
          ) : (
            <Rail
              side="right"
              label={selected ? recordTitle(selected, provisionalNames) : 'Record'}
              species={selected?.recordType === 'encounter'}
              sub={selected ? STATUS_WORD[selected.status] : undefined}
              keyHint="]"
              onOpen={() => togglePanel('record')}
            >
              {selected && (
                <span className={`fk-status fk-status--${selected.status} hq-rail__st`} title={STATUS_WORD[selected.status]}>
                  <Icon name={STATUS_ICON[selected.status]} />
                </span>
              )}
            </Rail>
          )}
        </main>
      )}

      {dragging && (
        <div className="hq-drop" aria-hidden>
          <div className="fk-group">
            <div className="fk-card">
              <span className="fk-tile fk-tile--dark">
                <Icon name="bundle" />
              </span>
              <b>Drop Field bundles to import</b>
              <p>Re-sends are safe: nothing is duplicated.</p>
            </div>
          </div>
        </div>
      )}
      {dialog === 'hq-bundle' && project && <HqBundleDialog project={project} onClose={() => setDialog('none')} />}
      {dialog === 'export' && project && setup && <ExportDialog setup={setup} onClose={() => setDialog('none')} onSelect={(k) => (pick(k), setView('review'), setDialog('none'))} />}
      {dialog === 'devices' && <DevicesPanel project={project} onClose={() => setDialog('none')} />}
      {dialog === 'ai' && (
        <AiPanel
          project={project}
          onClose={() => setDialog('none')}
          onSelect={(k) => (pick(k), setView('review'), setDialog('none'))}
          onReviewAll={() => void review()}
          keyVersion={keyVersion}
          onKeyChanged={() => setKeyVersion((v) => v + 1)}
        />
      )}
    </div>
  )
}
