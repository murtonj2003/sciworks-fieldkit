// One record, in full: every field with units, flags in plain words, the coordinate "did you mean?" audit trail,
// photos, revision history and diff, and the corrections waiting on it.

import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { FORMAT_LABELS, type Encounter, type FieldDef, type Overlay, type Project, type Survey, type Template } from '@sciworks/shared'
import { db, type AiNoteRow, type CorrectionRow, type RecordRow } from '../db'
import { GROUP_LABEL, STATUS_ICON, STATUS_WORD, fieldsFor, fmtLatLon, fmtNumber, fmtValue, recordTitle, valueAt } from '../lib/format'
import { approveDraft, diffRecords, discardDraft } from '../lib/review'
import { personName, teamName } from '../lib/setup'
import { shortTime } from '../lib/time'
import { CorrectionForm } from './CorrectionForm'

interface DetailProps {
  row?: RecordRow
  project?: Project
  templates: Template[]
  overlay?: Overlay
  corrections: CorrectionRow[]
  provisionalNames: Map<string, string>
  me: string
  onApprove: () => void
  onReject: () => void
  onReopen: () => void
  correctionOpen: boolean
  setCorrectionOpen: (v: boolean) => void
  aiNotes: AiNoteRow[]
}

const BAND_WORD = { green: 'On the line', amber: 'Near the line, check', red: 'Far off the line', 'outside-bbox': 'Outside the project area' } as const

export function Detail(props: DetailProps) {
  const { row, project, templates, overlay, corrections, provisionalNames, me } = props
  if (!row) return <section className="detail detail-empty">Select a record in the queue or on the map.</section>
  const template = templates.find((t) => t.coreVersion === row.data.coreVersion) ?? templates[templates.length - 1]
  const mine = corrections.filter((c) => c.recordKey === row.key && c.state !== 'discarded')

  return (
    <section className="detail" aria-label="Record detail">
      <header className="detail-head">
        <div>
          <h2>{recordTitle(row, provisionalNames)}</h2>
          <p className="muted">
            {teamName(project, row.teamId)} · {row.transectId} · rev {row.rev} · form core v{row.data.coreVersion}
            {row.data.overlayRev ? ` + team overlay ${row.data.overlayRev}` : ''}
          </p>
        </div>
        <span className={`badge status-${row.status}`}>
          <span aria-hidden>{STATUS_ICON[row.status]}</span> {STATUS_WORD[row.status]}
        </span>
      </header>

      <div className="detail-actions">
        <button className="btn btn-approve" onClick={props.onApprove} disabled={row.status === 'approved'}>
          ✓ Approve <kbd>A</kbd>
        </button>
        <button className="btn" onClick={props.onReject} disabled={row.status === 'rejected'}>
          ✕ Reject <kbd>R</kbd>
        </button>
        <button className="btn" onClick={() => props.setCorrectionOpen(!props.correctionOpen)}>
          ✎ Send correction <kbd>C</kbd>
        </button>
        {(row.status === 'approved' || row.status === 'rejected') && (
          <button className="btn btn-quiet" onClick={props.onReopen}>
            Back to queue
          </button>
        )}
      </div>
      {row.statusBy && (row.status === 'approved' || row.status === 'rejected') && (
        <p className="muted small">
          {STATUS_WORD[row.status]} by {personName(project, row.statusBy)}, {shortTime(row.statusAt)} (rev {row.reviewedRev})
          {row.statusNote ? `: "${row.statusNote}"` : ''}
        </p>
      )}

      {props.correctionOpen && <CorrectionForm row={row} template={template} overlay={overlay} me={me} onDone={() => props.setCorrectionOpen(false)} />}

      {mine.length > 0 && (
        <div className="panel">
          <h3>Corrections</h3>
          {mine.map((c) => (
            <CorrectionCard key={c.correctionId} c={c} me={me} project={project} />
          ))}
        </div>
      )}

      <Flags row={row} />
      {props.aiNotes.length > 0 && (
        <div className="panel">
          <h3>AI notes</h3>
          {props.aiNotes.map((n) => (
            <div key={n.id} className="correction correction-draft">
              <p>
                <span className="tag tag-ai">AI note</span> <span className="muted small">a suggestion, {shortTime(n.at)}</span>
              </p>
              <p>{n.text}</p>
              <button className="btn btn-quiet small" onClick={() => db.aiNotes.update(n.id!, { dismissed: true })}>
                Dismiss
              </button>
            </div>
          ))}
        </div>
      )}
      {row.status === 'edited' && <EditedDiff row={row} />}
      {row.recordType === 'encounter' && <CoordinateTrail row={row} project={project} />}
      <Fields row={row} template={template} overlay={overlay} project={project} />
      {row.recordType === 'encounter' && <KeyRun e={row.data as Encounter} />}
      {row.recordType === 'encounter' && <Photos recordId={row.id} />}
      <History row={row} />
    </section>
  )
}

function Flags({ row }: { row: RecordRow }) {
  if (!row.flags.length) return <div className="panel"><p className="ok">✓ No warnings from the phone's or HQ's checks.</p></div>
  return (
    <div className="panel">
      <h3>Flags</h3>
      <ul className="flags">
        {row.flags.map((f, i) => (
          <li key={i} className={`flag flag-${f.level}`}>
            <span aria-hidden>{f.level === 'warn' ? '⚠' : 'ℹ'}</span>
            <span>
              {f.text} <span className="muted small">({f.source === 'phone' ? 'from the phone' : f.source === 'batch' ? 'HQ, whole-walk check' : f.source === 'range' ? 'HQ, species pack range' : 'HQ check'})</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function CoordinateTrail({ row, project }: { row: RecordRow; project?: Project }) {
  const e = row.data as Encounter
  const loc = e.location
  const phone = loc.check
  const hq = row.hq?.coord
  const accepted = phone.decision?.kind === 'accepted-suggestion' ? (phone.suggestions.find((s) => s.kind === phone.decision?.suggestionKind) ?? phone.suggestions[0]) : undefined
  return (
    <div className="panel">
      <h3>Coordinate</h3>
      <dl className="kv">
        {loc.typed && (
          <>
            <dt>Typed</dt>
            <dd>
              <code>{loc.typed.raw}</code> <span className="muted">({FORMAT_LABELS[loc.typed.format]})</span>
            </dd>
          </>
        )}
        <dt>Source</dt>
        <dd>
          {loc.source === 'typed' ? 'Typed by hand' : loc.source === 'garmin-gpx' ? 'Garmin GPX' : 'Phone GPS'}
          {loc.accuracyM !== undefined ? ` · GPS accuracy ± ${loc.accuracyM} m` : ''}
        </dd>
        {loc.original && (
          <>
            <dt>Before the fix</dt>
            <dd>
              {fmtLatLon(loc.original.lat, loc.original.lon)} · <b>{fmtNumber(phone.offsetM, 0)} m off</b> {phone.transectId} ({BAND_WORD[phone.band]})
            </dd>
          </>
        )}
        {!loc.original && (
          <>
            <dt>Phone's check</dt>
            <dd>
              {BAND_WORD[phone.band]} · {fmtNumber(phone.offsetM, 1)} m from {phone.transectId} (allowed {phone.toleranceM} m)
            </dd>
          </>
        )}
        {phone.suggestions.length > 0 && (
          <>
            <dt>"Did you mean?"</dt>
            <dd>
              <ul className="plain">
                {phone.suggestions.map((s, i) => (
                  <li key={i}>
                    {s === accepted ? '✓ ' : ''}
                    {s.explain} → {fmtNumber(s.offsetM, 1)} m from the line{s.raw ? <> · <code>{s.raw}</code></> : null}
                  </li>
                ))}
              </ul>
            </dd>
          </>
        )}
        {phone.decision && (
          <>
            <dt>Surveyor's decision</dt>
            <dd>
              {phone.decision.kind === 'accepted-suggestion' ? 'Accepted the suggestion' : phone.decision.kind === 'kept-original' ? 'Kept what was typed' : phone.decision.kind === 're-taken' ? 'Re-took the point' : 'Overrode the check'}
              {' '}by {personName(project, phone.decision.by)}, {shortTime(phone.decision.at)}
              {phone.decision.reason ? `: "${phone.decision.reason}"` : ''}
            </dd>
          </>
        )}
        <dt>Accepted position</dt>
        <dd>{fmtLatLon(loc.lat, loc.lon)}</dd>
        {hq && (
          <>
            <dt>HQ's check now</dt>
            <dd>
              <b>{BAND_WORD[hq.band]}</b> · {fmtNumber(hq.offsetM, 1)} m from {hq.transectId} (allowed {hq.toleranceM} m) · {fmtNumber(hq.chainageM, 0)} m along
            </dd>
          </>
        )}
        {e.distanceAlongM && (
          <>
            <dt>Distance along</dt>
            <dd>
              {fmtNumber(e.distanceAlongM.value, 0)} m ({e.distanceAlongM.source === 'auto' ? 'worked out from the point' : 'typed'})
            </dd>
          </>
        )}
      </dl>
    </div>
  )
}

function Fields({ row, template, overlay, project }: { row: RecordRow; template?: Template; overlay?: Overlay; project?: Project }) {
  const fields = fieldsFor(row.recordType, template, overlay).filter((f) => f.type !== 'location' && f.type !== 'photos')
  const groups = new Map<string, FieldDef[]>()
  for (const f of fields) groups.set(f.group, [...(groups.get(f.group) ?? []), f])
  const data = row.data
  return (
    <div className="panel">
      <h3>Fields</h3>
      {[...groups.entries()].map(([group, fs]) => {
        const shown = fs.filter((f) => valueAt(data, f.path) !== undefined || !f.hidden)
        if (!shown.length) return null
        return (
          <div key={group} className="field-group">
            <h4>{GROUP_LABEL[group] ?? group}</h4>
            <dl className="kv">
              {shown.map((f) => (
                <FieldRow key={f.key} f={f} data={data} project={project} />
              ))}
            </dl>
          </div>
        )
      })}
      {row.recordType === 'survey' && <SurveyExtras s={data as Survey} />}
    </div>
  )
}

function FieldRow({ f, data, project }: { f: FieldDef; data: RecordRow['data']; project?: Project }) {
  let v = valueAt(data, f.path)
  if (f.type === 'taxon') {
    const t = (data as Encounter).taxon
    v = [t.scientificName ?? (t.provisionalTaxonId ? 'provisional species' : t.unidentified ? 'unidentified' : ''), `ID by ${t.idBasis.replace('-', ' ')}`].filter(Boolean).join(' · ')
  }
  return (
    <>
      <dt>
        {f.label}
        {f.origin === 'team' && <span className="tag tag-info small">team field</span>}
      </dt>
      <dd>{fmtValue(v, f, project)}</dd>
    </>
  )
}

function SurveyExtras({ s }: { s: Survey }) {
  return (
    <div className="field-group">
      <h4>Worked out</h4>
      <dl className="kv">
        <dt>Effort</dt>
        <dd>{s.effortPersonHours !== undefined ? `${fmtNumber(s.effortPersonHours)} person-hours` : '—'}</dd>
        {s.astro && (
          <>
            <dt>Sun</dt>
            <dd>
              Sunset {s.astro.sunset.slice(11, 16)} · started {s.astro.minutesAfterSunsetAtStart} min after sunset
            </dd>
            <dt>Moon</dt>
            <dd>
              {s.astro.moonIlluminationPct}% lit · {s.astro.moonAboveHorizonAtStart ? 'up at start' : 'not up at start'}
            </dd>
          </>
        )}
      </dl>
    </div>
  )
}

function KeyRun({ e }: { e: Encounter }) {
  const k = e.taxon.keyRun
  if (!k) return null
  return (
    <div className="panel">
      <h3>Species key on the phone</h3>
      <ol className="plain">
        {k.candidates.slice(0, 3).map((c) => (
          <li key={c.taxonId}>
            <i>{c.scientificName}</i> {c.dangerous ? '⚠ dangerous' : ''} · score {fmtNumber(c.score)} · {c.matched.join('; ')}
            {c.conflicts.length ? ` · conflicts: ${c.conflicts.join('; ')}` : ''}
          </li>
        ))}
      </ol>
      {k.checkNext && <p className="muted small">Check next: {k.checkNext}</p>}
    </div>
  )
}

function Photos({ recordId }: { recordId: string }) {
  const photos = useLiveQuery(() => db.photos.where('recordId').equals(recordId).toArray(), [recordId]) ?? []
  const urls = useMemo(() => photos.map((p) => URL.createObjectURL(new Blob([p.bytes as BlobPart], { type: 'image/jpeg' }))), [photos])
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls])
  if (!photos.length) return null
  return (
    <div className="panel">
      <h3>Photos</h3>
      <div className="photos">
        {photos.map((p, i) => (
          <figure key={p.key}>
            <img src={urls[i]} alt={`${p.meta.role ?? 'photo'} of the animal`} />
            <figcaption className="muted small">{p.meta.role ?? 'photo'} · {shortTime(p.meta.takenAt)}</figcaption>
          </figure>
        ))}
      </div>
    </div>
  )
}

function EditedDiff({ row }: { row: RecordRow }) {
  const reviewed = useLiveQuery(() => (row.reviewedRev ? db.revisions.get(`${row.key}:${row.reviewedRev}`) : undefined), [row.key, row.reviewedRev])
  if (!reviewed) return null
  const lines = diffRecords(reviewed.data, row.data)
  return (
    <div className="panel panel-edited">
      <h3>
        ✎ Changed since you reviewed rev {row.reviewedRev} (now rev {row.rev})
      </h3>
      <DiffTable lines={lines} />
    </div>
  )
}

function DiffTable({ lines }: { lines: ReturnType<typeof diffRecords> }) {
  if (!lines.length) return <p className="muted">No field changed (only the revision number).</p>
  return (
    <table className="diff">
      <thead>
        <tr>
          <th>Field</th>
          <th>Before</th>
          <th>After</th>
        </tr>
      </thead>
      <tbody>
        {lines.map((l) => (
          <tr key={l.path}>
            <td>
              <code>{l.path}</code>
            </td>
            <td className="diff-before">{fmtValue(l.before)}</td>
            <td className="diff-after">{fmtValue(l.after)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function History({ row }: { row: RecordRow }) {
  const revs = useLiveQuery(() => db.revisions.where('recordKey').equals(row.key).sortBy('rev'), [row.key, row.rev]) ?? []
  const [open, setOpen] = useState<number | undefined>()
  const [raw, setRaw] = useState(false)
  return (
    <div className="panel">
      <h3>Versions received</h3>
      <ul className="plain">
        {revs.map((r, i) => (
          <li key={r.key}>
            <button className="link" onClick={() => setOpen(open === r.rev ? undefined : r.rev)}>
              rev {r.rev}
            </button>{' '}
            <span className="muted small">
              received {shortTime(r.receivedAt)}
              {r.rev === row.rev ? ' · current' : ' · history'}
            </span>
            {open === r.rev && i > 0 && <DiffTable lines={diffRecords(revs[i - 1]!.data, r.data)} />}
            {open === r.rev && i === 0 && <p className="muted small">The first version HQ received.</p>}
          </li>
        ))}
      </ul>
      <button className="link small" onClick={() => setRaw(!raw)}>
        {raw ? 'Hide' : 'Show'} the raw record
      </button>
      {raw && <pre className="raw">{JSON.stringify(row.data, null, 2)}</pre>}
    </div>
  )
}

function CorrectionCard({ c, me, project }: { c: CorrectionRow; me: string; project?: Project }) {
  const [proposed, setProposed] = useState(JSON.stringify(c.proposed))
  const [reason, setReason] = useState(c.reason)
  const isDraft = c.state === 'draft'
  return (
    <div className={`correction ${isDraft ? 'correction-draft' : ''}`}>
      <p>
        {c.source === 'ai-agent' && <span className="tag tag-ai">AI draft</span>}{' '}
        {isDraft ? 'Waiting for your decision' : `Approved by ${personName(project, c.approvedBy)}, ${shortTime(c.approvedAt)}. Goes in the next HQ bundle.`}
      </p>
      <dl className="kv">
        <dt>Field</dt>
        <dd>
          <code>{c.fieldPath}</code>
        </dd>
        <dt>Now</dt>
        <dd>{fmtValue(c.current)}</dd>
        <dt>Proposed</dt>
        <dd>{isDraft ? <input className="input-wide" value={proposed} onChange={(e) => setProposed(e.target.value)} /> : fmtValue(c.proposed)}</dd>
        <dt>Why</dt>
        <dd>{isDraft ? <textarea className="input-wide" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} /> : c.reason}</dd>
      </dl>
      {isDraft && (
        <div className="detail-actions">
          <button
            className="btn btn-approve"
            onClick={() => {
              let p: unknown = proposed
              try {
                p = JSON.parse(proposed)
              } catch {
                /* keep as text */
              }
              approveDraft(c.correctionId, me, { proposed: p, reason })
            }}
          >
            ✓ Approve draft
          </button>
          <button className="btn btn-quiet" onClick={() => discardDraft(c.correctionId)}>
            Discard
          </button>
        </div>
      )}
    </div>
  )
}
