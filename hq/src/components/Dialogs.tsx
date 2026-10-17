// Make HQ bundle · Export Darwin Core · Devices.

import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import type { Project } from '@sciworks/shared'
import { db } from '../db'
import { buildDwcArchive, type DwcResult } from '../lib/dwc'
import { download } from '../lib/files'
import { recordTitle } from '../lib/format'
import { makeHqBundle, type HqBundleResult } from '../lib/hqBundle'
import { setStatus } from '../lib/review'
import { dataManagerOf, personName, teamName, type Setup } from '../lib/setup'
import { daysBetween, nowIso, shortTime } from '../lib/time'

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2>{title}</h2>
          <button className="btn btn-quiet" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>
        {children}
      </div>
    </div>
  )
}

export function HqBundleDialog({ project, onClose }: { project: Project; onClose: () => void }) {
  const teams = project.teams.filter((t) => t.transectIds.length)
  const [teamId, setTeamId] = useState(teams[0]?.teamId ?? '')
  const [result, setResult] = useState<HqBundleResult>()
  const [error, setError] = useState('')
  const pending = useLiveQuery(() => db.corrections.where('state').equals('draft').count(), [], 0)
  const make = async () => {
    setError('')
    try {
      const r = await makeHqBundle(teamId)
      setResult(r)
      download(r.bytes, r.fileName)
    } catch (e) {
      setError((e as Error).message)
    }
  }
  return (
    <Modal title="Make an HQ bundle for a team" onClose={onClose}>
      <p>
        It carries the current form, the team's transects, the species pack, a receipt for every record HQ holds from the team, your review
        results and approved corrections. AirDrop or USB it to the team's phones.
      </p>
      <label>
        Team
        <select value={teamId} onChange={(e) => (setTeamId(e.target.value), setResult(undefined))}>
          {teams.map((t) => (
            <option key={t.teamId} value={t.teamId}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      {pending > 0 && <p className="muted small">{pending} AI draft{pending === 1 ? '' : 's'} not yet approved: they stay at HQ.</p>}
      <div className="detail-actions">
        <button className="btn btn-primary" onClick={make}>
          Make and download
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      {result && (
        <div className="panel">
          <p>
            ✓ Downloaded <code>{result.fileName}</code>
          </p>
          <ul className="plain small">
            <li>{result.counts.receipts} receipts (the phone's "not with HQ" counter drops by these)</li>
            <li>{result.counts.reviews} review results</li>
            <li>{result.counts.corrections} approved corrections</li>
            <li>
              {result.counts.taxonDecisions} species decisions · {result.counts.changeRequestDecisions} form-request decisions
            </li>
            <li>{result.counts.transects} transects</li>
          </ul>
        </div>
      )}
    </Modal>
  )
}

export function ExportDialog({ setup, onClose, onSelect }: { setup: Setup; onClose: () => void; onSelect: (key: string) => void }) {
  const records = useLiveQuery(() => db.records.toArray(), [], [])
  const provisional = useLiveQuery(() => db.provisionalTaxa.toArray(), [], [])
  const decisions = useLiveQuery(() => db.taxonDecisions.toArray(), [], [])
  const corrections = useLiveQuery(() => db.corrections.toArray(), [], [])
  const answers = useLiveQuery(() => db.correctionResponses.toArray(), [], [])
  const [done, setDone] = useState('')
  const result: DwcResult | undefined = useMemo(() => {
    if (!setup.project) return undefined
    return buildDwcArchive({
      records,
      project: setup.project,
      template: setup.template,
      templates: setup.templates,
      transects: setup.transects,
      speciesPack: setup.speciesPack,
      attribution: setup.attribution,
      provisionalTaxa: provisional.map((p) => p.data),
      taxonDecisions: decisions,
      corrections,
      answeredCorrectionIds: new Set(answers.map((a) => a.correctionId)),
      createdAt: nowIso(),
    })
  }, [records, provisional, decisions, corrections, answers, setup])
  if (!result) return null
  const byKey = new Map(records.map((r) => [r.key, r]))
  const surveyWaiting = result.skipped.filter((s) => s.why.startsWith('approved, but its survey'))
  const surveyKeys = [...new Set(surveyWaiting.map((s) => `survey:${(byKey.get(s.key)?.data as { surveyId?: string })?.surveyId}`))]
  const me = dataManagerOf(setup.project)
  return (
    <Modal title="Export Darwin Core (approved records only)" onClose={onClose}>
      <p>
        <b>{result.events}</b> surveys (Event) · <b>{result.occurrences}</b> animals (Occurrence) · <b>{result.measurements}</b> measurements
        (MeasurementOrFact), with <code>meta.xml</code>, <code>eml.xml</code> and <code>attribution.md</code>.
      </p>
      {result.skipped.some((s) => s.why.includes('correction is waiting')) && (
        <p className="muted">
          ✎ {result.skipped.filter((s) => s.why.includes('correction is waiting')).length} approved record(s) held back: you sent a correction and the
          surveyor hasn't answered yet. They export once the fix (or a "decline") comes back in a Field bundle.
        </p>
      )}
      {surveyKeys.length > 0 && (
        <div className="panel panel-edited">
          <p>
            {surveyWaiting.length} approved animal{surveyWaiting.length === 1 ? ' is' : 's are'} waiting for their survey to be approved (each animal
            needs its Event).
          </p>
          {surveyKeys.map((k) => (
            <button key={k} className="btn" onClick={() => setStatus(k, 'approved', { by: me.personId })} disabled={!byKey.get(k)}>
              ✓ Approve {byKey.get(k) ? `${recordTitle(byKey.get(k)!)} (${byKey.get(k)!.date})` : 'survey (not received yet)'}
            </button>
          ))}
        </div>
      )}
      <div className="detail-actions">
        <button
          className="btn btn-primary"
          onClick={() => {
            download(result.zip, result.fileName)
            setDone(result.fileName)
          }}
          disabled={result.occurrences + result.events === 0}
        >
          Download {result.fileName}
        </button>
      </div>
      {done && <p>✓ Downloaded <code>{done}</code>. Open Occurrence.csv to check it.</p>}
      {result.skipped.length > 0 && (
        <details>
          <summary>{result.skipped.length} records not included, and why</summary>
          <ul className="plain small">
            {result.skipped.map((s) => (
              <li key={s.key}>
                <button className="link" onClick={() => onSelect(s.key)}>
                  {byKey.get(s.key) ? recordTitle(byKey.get(s.key)!) : s.key}
                </button>
                : {s.why}
              </li>
            ))}
          </ul>
        </details>
      )}
    </Modal>
  )
}

export function DevicesPanel({ project, onClose }: { project?: Project; onClose: () => void }) {
  const devices = useLiveQuery(() => db.devices.toArray(), [], [])
  const bundles = useLiveQuery(() => db.bundles.orderBy('lastImportedAt').reverse().toArray(), [], [])
  return (
    <Modal title="Devices and bundles" onClose={onClose}>
      <table className="table">
        <thead>
          <tr>
            <th>Device</th>
            <th>Team</th>
            <th>Last used by</th>
            <th>Last bundle made</th>
            <th>Bundles</th>
            <th>Versions received</th>
          </tr>
        </thead>
        <tbody>
          {devices.map((d) => (
            <tr key={d.deviceId}>
              <td>
                <code>…{d.deviceId.replace(/-/g, '').slice(-4)}</code>
              </td>
              <td>{teamName(project, d.teamId)}</td>
              <td>{personName(project, d.personId)}</td>
              <td>
                {shortTime(d.lastBundleAt)} <span className="muted small">({daysBetween(d.lastBundleAt)} days ago)</span>
              </td>
              <td>{d.bundles}</td>
              <td>{d.revsReceived}</td>
            </tr>
          ))}
          {devices.length === 0 && (
            <tr>
              <td colSpan={6} className="muted">
                No phone bundles yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <h3>Every bundle file HQ holds (the backup)</h3>
      <ul className="plain small">
        {bundles.map((b) => (
          <li key={b.sha256}>
            {b.direction === 'in' ? '↓' : '↑'} <code>{b.fileName}</code> · {b.kind} · {shortTime(b.lastImportedAt)}
            {b.timesImported > 1 ? ` · imported ${b.timesImported}×` : ''}
            {b.error ? ` · ⚠ ${b.error}` : ''}
          </li>
        ))}
      </ul>
    </Modal>
  )
}
