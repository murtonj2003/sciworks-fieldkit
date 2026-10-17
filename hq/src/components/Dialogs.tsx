// Make bundle for a team · Export Darwin Core (wireframe H3) · Devices. All on the kit's dialog shell.

import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import type { Project } from '@sciworks/shared'
import { db } from '../db'
import { Icon, Mark } from '../kit/Icons'
import { Dialog } from '../kit/ui'
import { buildDwcArchive, type DwcResult } from '../lib/dwc'
import { download } from '../lib/files'
import { recordTitle } from '../lib/format'
import { makeHqBundle, type HqBundleResult } from '../lib/hqBundle'
import { setStatus } from '../lib/review'
import { dataManagerOf, personName, teamName, type Setup } from '../lib/setup'
import { daysBetween, nowIso, shortTime } from '../lib/time'

export function HqBundleDialog({ project, onClose }: { project: Project; onClose: () => void }) {
  const teams = project.teams.filter((t) => t.transectIds.length)
  const [teamId, setTeamId] = useState(teams[0]?.teamId ?? '')
  const [result, setResult] = useState<HqBundleResult>()
  const [error, setError] = useState('')
  const pending = useLiveQuery(() => db.corrections.where('state').equals('draft').count(), [], 0)
  const pictures = useLiveQuery(() => db.basemaps.count(), [], 0)
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
    <Dialog
      title="Make bundle for a team"
      onClose={onClose}
      foot={
        <>
          <button className="fk-btn fk-btn--grey fk-btn--36" onClick={onClose}>
            Close
          </button>
          <button className="fk-btn fk-btn--primary fk-btn--36" onClick={make} disabled={!teamId}>
            <Icon name="bundle" />
            Make and download
          </button>
        </>
      }
    >
      <p>
        It carries the current form, the team's transects{pictures ? ' with the satellite picture under them' : ''}, the species pack and its photos, every
        record HQ has from the team, your review results and the corrections you approved. AirDrop it or copy it to the team's phones.
      </p>
      <div className="fk-group">
        <label className="hq-field" style={{ padding: '2px 4px 4px' }}>
          Team
          <select className="hq-input" value={teamId} onChange={(e) => (setTeamId(e.target.value), setResult(undefined))}>
            {teams.map((t) => (
              <option key={t.teamId} value={t.teamId}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {pending > 0 && (
        <p className="fk-info">
          <Icon name="reviewer" />
          <span>
            {pending} AI draft{pending === 1 ? '' : 's'} not approved yet: {pending === 1 ? 'it stays' : 'they stay'} at HQ until you decide.
          </span>
        </p>
      )}
      {error && (
        <p className="fk-error">
          <Icon name="warning" />
          {error}
        </p>
      )}
      {result && (
        <p className="fk-success">
          <Mark band="on" />
          <span>
            Bundle made: <b>{result.fileName}</b>.
            <span style={{ display: 'block', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
              {result.counts.receipts} records confirmed (the phone's "not with HQ" counter drops by these) · {result.counts.reviews} review results ·{' '}
              {result.counts.corrections} approved corrections · {result.counts.taxonDecisions} species decisions · {result.counts.changeRequestDecisions}{' '}
              form-request decisions · {result.counts.transects} transects · {result.counts.basemaps} satellite picture
              {result.counts.basemaps === 1 ? '' : 's'} · {result.counts.speciesPhotos} species photo{result.counts.speciesPhotos === 1 ? '' : 's'}.
            </span>
          </span>
        </p>
      )}
    </Dialog>
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
  const heldBack = result.skipped.filter((s) => s.why.includes('correction is waiting')).length
  const surveyWaiting = result.skipped.filter((s) => s.why.startsWith('approved, but its survey'))
  const surveyKeys = [...new Set(surveyWaiting.map((s) => `survey:${(byKey.get(s.key)?.data as { surveyId?: string })?.surveyId}`))]
  const me = dataManagerOf(setup.project)
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
  return (
    <Dialog
      title="Export Darwin Core (approved records only)"
      onClose={onClose}
      foot={
        <>
          <button className="fk-btn fk-btn--grey fk-btn--36" onClick={onClose}>
            Close
          </button>
          <button
            className="fk-btn fk-btn--primary fk-btn--36"
            onClick={() => {
              download(result.zip, result.fileName)
              setDone(result.fileName)
            }}
            disabled={result.occurrences + result.events === 0}
          >
            <Icon name="download" />
            Download {result.fileName}
          </button>
        </>
      }
    >
      <p>
        <b>{plural(result.events, 'survey', 'surveys')}</b> (Event) · <b>{plural(result.occurrences, 'animal', 'animals')}</b> (Occurrence) ·{' '}
        <b>{plural(result.measurements, 'measurement', 'measurements')}</b> (MeasurementOrFact), with meta.xml, eml.xml and attribution.md.
      </p>
      {heldBack > 0 && (
        <p className="fk-hint">
          <Icon name="info" />
          <span>
            {plural(heldBack, 'approved record', 'approved records')} held back: you sent a correction and the surveyor hasn't answered yet. It exports
            once the fix (or a "decline") comes back in a Field bundle.
          </span>
        </p>
      )}
      {surveyKeys.length > 0 && (
        <div className="fk-hint">
          <Icon name="info" />
          <div>
            <p>
              {plural(surveyWaiting.length, 'approved animal is', 'approved animals are')} waiting for {surveyKeys.length === 1 ? 'its survey' : 'their surveys'} to be
              approved: every animal needs its Event.
            </p>
            <div className="fk-hint__actions">
              {surveyKeys.map((k) => (
                <button key={k} className="fk-btn fk-btn--grey fk-btn--36" onClick={() => setStatus(k, 'approved', { by: me.personId })} disabled={!byKey.get(k)}>
                  Approve {byKey.get(k) ? `${recordTitle(byKey.get(k)!)}, ${byKey.get(k)!.date}` : 'the survey (not received yet)'}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      {result.skipped.length > 0 && (
        <details className="pg-why">
          <summary>
            <Icon name="chev-down" />
            {plural(result.skipped.length, 'record', 'records')} not included, and why
          </summary>
          <ul>
            {[...result.skipped]
              .sort((a, b) => +b.why.includes('correction is waiting') - +a.why.includes('correction is waiting'))
              .map((s) => {
              const r = byKey.get(s.key)
              return (
                <li key={s.key}>
                  <span>
                    <button className={`hq-textlink${r?.recordType === 'encounter' ? ' fk-sp' : ''}`} onClick={() => onSelect(s.key)}>
                      {r ? recordTitle(r) : s.key}
                    </button>
                    : {s.why}
                  </span>
                  {r && (
                    <small>
                      {teamName(setup.project, r.teamId)} · {r.transectId}
                    </small>
                  )}
                </li>
              )
            })}
          </ul>
        </details>
      )}
      {done && (
        <p className="fk-success">
          <Mark band="on" />
          <span>Downloaded {done}. Open Occurrence.csv to check it.</span>
        </p>
      )}
    </Dialog>
  )
}

export function DevicesPanel({ project, onClose }: { project?: Project; onClose: () => void }) {
  const devices = useLiveQuery(() => db.devices.toArray(), [], [])
  const bundles = useLiveQuery(() => db.bundles.orderBy('lastImportedAt').reverse().toArray(), [], [])
  return (
    <Dialog
      title="Devices and bundles"
      wide
      onClose={onClose}
      foot={
        <button className="fk-btn fk-btn--grey fk-btn--36" onClick={onClose}>
          Close
        </button>
      }
    >
      <div className="fk-group">
        <table className="hq-table">
          <thead>
            <tr>
              <th>Phone</th>
              <th>Team</th>
              <th>Last used by</th>
              <th>Last handover</th>
              <th>Bundles</th>
              <th>Versions received</th>
            </tr>
          </thead>
          <tbody>
            {devices.map((d) => (
              <tr key={d.deviceId}>
                <td>
                  <span className="hq-coord">…{d.deviceId.replace(/-/g, '').slice(-4)}</span>
                </td>
                <td>{teamName(project, d.teamId)}</td>
                <td>{personName(project, d.personId)}</td>
                <td>
                  {shortTime(d.lastBundleAt)} <span className="hq-dim">({daysBetween(d.lastBundleAt) === 0 ? 'today' : `${daysBetween(d.lastBundleAt)} days ago`})</span>
                </td>
                <td>{d.bundles}</td>
                <td>{d.revsReceived}</td>
              </tr>
            ))}
            {devices.length === 0 && (
              <tr>
                <td colSpan={6} className="hq-dim">
                  No phone bundles yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <details className="pg-why">
        <summary>
          <Icon name="chev-down" />
          Every bundle file HQ holds ({bundles.length}): the backup
        </summary>
        <ul>
          {bundles.map((b) => (
            <li key={b.sha256}>
              <span>
                <Icon name={b.direction === 'in' ? 'download' : 'upload'} /> <span className="hq-nw">{b.fileName}</span>
                {b.error ? <span className="hq-dim"> · {b.error}</span> : null}
              </span>
              <small>
                {b.direction === 'in' ? 'received' : 'made'} {shortTime(b.lastImportedAt)}
                {b.timesImported > 1 ? ` · imported ${b.timesImported}×` : ''}
              </small>
            </li>
          ))}
        </ul>
      </details>
    </Dialog>
  )
}
