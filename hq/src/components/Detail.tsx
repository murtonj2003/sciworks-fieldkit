// One record, in full (wireframe H1): a fixed head and action row, then what needs a decision (the AI's
// "Did you mean?" draft, what changed since review), the flags and where they came from, the coordinate trail
// from typed to fixed, every field with units, photos, and every version received.

import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { FORMAT_LABELS, TRAIT_LABEL, type Encounter, type FieldDef, type Overlay, type Project, type SpeciesPack, type Survey, type Template } from '@sciworks/shared'
import { db, type AiNoteRow, type CorrectionRow, type RecordRow } from '../db'
import { DecidedCard, DraftCard, CharDiff } from '../kit/DidYouMean'
import { FoldButton } from '../kit/Rail'
import { Icon, Mark } from '../kit/Icons'
import { BandText, StatusChip, Tag, WithSpecies } from '../kit/ui'
import { GROUP_LABEL, ID_BASIS, STATUS_WORD, UNIT_LABEL, fieldsFor, fmtLatLon, fmtNumber, fmtValue, recordTitle, shortLabel, valueAt } from '../lib/format'
import { diffRecords } from '../lib/review'
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
  speciesPack?: SpeciesPack
  me: string
  onApprove: () => void
  onReject: () => void
  onReopen: () => void
  correctionOpen: boolean
  setCorrectionOpen: (v: boolean) => void
  aiNotes: AiNoteRow[]
  /** Folds the record panel to a slim rail. */
  onFold?: () => void
}

export function Detail(props: DetailProps) {
  const { row, project, templates, overlay, corrections, provisionalNames, speciesPack, me } = props
  if (!row) {
    return (
      <section className="fk-col hq-record" aria-label="Record">
        <div className="fk-col-h">
          <h3>Record</h3>
          {props.onFold && <FoldButton side="right" label="Fold the record away" keyHint="]" onClick={props.onFold} />}
        </div>
        <div className="fk-group hq-empty-col">
          <div className="fk-card">
            <span className="fk-tile">
              <Icon name="map-pin" />
            </span>
            <p className="fk-empty">Select a record in the queue or on the map.</p>
          </div>
        </div>
      </section>
    )
  }
  const template = templates.find((t) => t.coreVersion === row.data.coreVersion) ?? templates[templates.length - 1]
  const fields = fieldsFor(row.recordType, template, overlay)
  const labelOf = (path: string) => fields.find((f) => f.path === path)?.label ?? path
  const shortOf = (path: string) => shortLabel(labelOf(path))
  const mine = corrections.filter((c) => c.recordKey === row.key && c.state !== 'discarded')
  const drafts = mine.filter((c) => c.state === 'draft')
  const decided = mine.filter((c) => c.state === 'approved')
  const e = row.recordType === 'encounter' ? (row.data as Encounter) : undefined
  const venom = !!e?.taxon.taxonId && !!speciesPack?.taxa.find((t) => t.taxonId === e.taxon.taxonId)?.dangerous

  return (
    <section className="fk-col hq-record" aria-label="Record">
      <div className="fk-col-h">
        <div className="hq-col-h__l">
          <h3>Record</h3>
          <span>version {row.rev}</span>
        </div>
        {props.onFold && <FoldButton side="right" label="Fold the record away" keyHint="]" onClick={props.onFold} />}
      </div>
      <div className="fk-group fk-det">
        <div className="fk-card">
          <div className="fk-det__head">
            <div>
              <h4 className={e && !e.taxon.unidentified ? 'fk-sp' : undefined}>{recordTitle(row, provisionalNames)}</h4>
              <p>
                {teamName(project, row.teamId)} · {row.transectId} · version {row.rev} ·{' '}
                <span className="hq-nw">
                  form core v{row.data.coreVersion}
                  {row.data.overlayRev ? ` + team change ${row.data.overlayRev}` : ''}
                </span>
              </p>
              {venom && (
                <p style={{ marginTop: 6 }}>
                  <Tag kind="venom">VENOMOUS</Tag>
                </p>
              )}
            </div>
            <StatusChip status={row.status} />
          </div>
          <div className="fk-acts hq-acts">
            <button className="fk-btn fk-btn--primary fk-btn--36" onClick={props.onApprove} disabled={row.status === 'approved'}>
              Approve <span className="fk-kbd">A</span>
            </button>
            <button className="fk-btn fk-btn--grey fk-btn--36" onClick={props.onReject} disabled={row.status === 'rejected'}>
              Reject <span className="fk-kbd">R</span>
            </button>
            <button className="fk-btn fk-btn--grey fk-btn--36" onClick={() => props.setCorrectionOpen(!props.correctionOpen)} aria-expanded={props.correctionOpen}>
              Send correction <span className="fk-kbd">C</span>
            </button>
          </div>
          {(row.status === 'approved' || row.status === 'rejected') && row.statusBy && (
            <p className="hq-fnote">
              {STATUS_WORD[row.status]} by {personName(project, row.statusBy)}, {shortTime(row.statusAt)} (version {row.reviewedRev})
              {row.statusNote ? `: "${row.statusNote}"` : ''}.{' '}
              <button className="hq-textlink" onClick={props.onReopen}>
                Back to the queue
              </button>
            </p>
          )}
        </div>
      </div>

      <div className="hq-scroll">
        {e && <Photos recordId={row.id} taxonId={e.taxon.taxonId} speciesName={e.taxon.scientificName} />}
        {props.correctionOpen && <CorrectionForm row={row} template={template} overlay={overlay} me={me} onDone={() => props.setCorrectionOpen(false)} />}
        {drafts.map((c) => (
          <DraftCard key={c.correctionId} c={c} row={row} label={shortOf(c.fieldPath)} me={me} pack={speciesPack} />
        ))}
        {row.status === 'edited' && <EditedDiff row={row} labelOf={labelOf} />}
        {decided.map((c) => (
          <DecidedCard key={c.correctionId} c={c} label={shortOf(c.fieldPath)} project={project} />
        ))}

        <h4 className="fk-gt">Flags</h4>
        <Flags row={row} species={e?.taxon.scientificName} />
        {props.aiNotes.length > 0 && (
          <>
            <h4 className="fk-gt">AI reviewer notes</h4>
            <div className="fk-group">
              {props.aiNotes.map((n) => (
                <div key={n.id} className="hq-note-row">
                  <Icon name="reviewer" />
                  <p>{n.text}</p>
                  <button className="hq-textlink" onClick={() => db.aiNotes.update(n.id!, { dismissed: true })}>
                    Dismiss
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
        {e && <CoordinateTrail row={row} project={project} />}
        <Fields row={row} fields={fields} project={project} />
        {e && <KeyRun e={e} />}
        <Versions row={row} labelOf={labelOf} />
      </div>
    </section>
  )
}

function Flags({ row, species }: { row: RecordRow; species?: string }) {
  if (!row.flags.length) {
    return (
      <div className="fk-group">
        <p className="fk-hint fk-hint--line hq-ok">
          <Mark band="on" />
          No warnings from the phone's or HQ's checks.
        </p>
      </div>
    )
  }
  const src = (s: string) => (s === 'phone' ? 'from the phone' : s === 'batch' ? 'HQ, whole-walk check' : s === 'range' ? 'HQ, species pack range' : s === 'setup' ? 'HQ set-up' : 'HQ check')
  return (
    <div className="fk-group">
      {row.flags.map((f, i) => (
        <p key={i} className={`fk-hint fk-hint--line${f.level === 'info' ? ' hq-hint-info' : ''}`}>
          <Icon name={f.code === 'FIXED_IN_FIELD' ? 'crosshair' : f.level === 'warn' ? 'flag' : 'info'} />
          <span>
            <WithSpecies text={f.text} names={[species]} /> <span className="hq-src">({src(f.source)})</span>
          </span>
        </p>
      ))}
    </div>
  )
}

function CoordinateTrail({ row, project }: { row: RecordRow; project?: Project }) {
  const e = row.data as Encounter
  const loc = e.location
  const phone = loc.check
  const hq = row.hq?.coord
    const decisionWord =
    phone.decision?.kind === 'accepted-suggestion'
      ? 'Accepted the suggestion'
      : phone.decision?.kind === 'kept-original'
        ? 'Kept what was typed'
        : phone.decision?.kind === 're-taken'
          ? 'Re-took the point'
          : 'Overrode the check'
  return (
    <>
      <h4 className="fk-gt">Coordinate</h4>
      <div className="fk-group">
        <dl className="fk-card fk-kv hq-kv">
          {loc.typed && (
            <>
              <dt>Typed</dt>
              <dd>
                <span className="hq-coord">{loc.typed.raw}</span> <span className="hq-dim hq-block">({FORMAT_LABELS[loc.typed.format]})</span>
              </dd>
            </>
          )}
          <dt>Source</dt>
          <dd>
            {loc.source === 'typed' ? 'Typed by hand' : loc.source === 'garmin-gpx' ? 'Garmin GPX' : 'Phone GPS'}
            {loc.accuracyM !== undefined ? ` · GPS ± ${loc.accuracyM} m` : ''}
          </dd>
          {loc.original ? (
            <>
              <dt>Before the fix</dt>
              <dd>
                <BandText band={phone.band} size={14} /> · {fmtNumber(phone.offsetM, 0)} m off {phone.transectId}
              </dd>
            </>
          ) : (
            <>
              <dt>Phone's check</dt>
              <dd>
                <BandText band={phone.band} size={14} /> · {fmtNumber(phone.offsetM, 1)} m from {phone.transectId} (allowed {phone.toleranceM} m)
              </dd>
            </>
          )}
          {phone.suggestions.length > 0 && (
            <>
              <dt>Did you mean?</dt>
              <dd>
                <ul>
                  {phone.suggestions.map((s, i) => {
                    // Mark only the number that changed: 115[13]70 → 115[31]70.
                    const a = loc.typed?.raw.split(/\s+/) ?? []
                    const b = s.raw?.split(/\s+/) ?? []
                    const at = a.findIndex((t, k) => t !== b[k])
                    const d = s.raw && at >= 0 && a.length === b.length ? CharDiff({ from: a[at]!, to: b[at]! }) : undefined
                    return (
                      <li key={i}>
                        {s.explain.replace(/\s*\([^)]*\)\.?$/, '').replace(/\.$/, '')} <Icon name="arrow" label="to" /> {fmtNumber(s.offsetM, 1)} m from the line
                        {d && (
                          <span className="hq-digits">
                            {d.old} <Icon name="arrow" label="to" /> {d.new}
                          </span>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </dd>
            </>
          )}
          {phone.decision && (
            <>
              <dt>Surveyor's decision</dt>
              <dd>
                {decisionWord} by {personName(project, phone.decision.by)}, {phone.decision.at.slice(11, 16)}
                {phone.decision.reason ? `: "${phone.decision.reason}"` : ''}
              </dd>
            </>
          )}
          <dt>Accepted position</dt>
          <dd className="hq-coord" style={{ fontWeight: 500 }}>
            {fmtLatLon(loc.lat, loc.lon)}
          </dd>
          {hq && (
            <>
              <dt>HQ's check now</dt>
              <dd>
                <BandText band={hq.band} size={14} /> · {fmtNumber(hq.offsetM, 1)} m from {hq.transectId} (allowed {hq.toleranceM} m) · {fmtNumber(hq.chainageM, 0)} m along
              </dd>
            </>
          )}
        </dl>
      </div>
    </>
  )
}

/** A value as a tile: the number big with its unit small, or the words. */
function Tile({ f, data, project, flagged, edited }: { f: FieldDef; data: RecordRow['data']; project?: Project; flagged?: boolean; edited?: boolean }) {
  let v = valueAt(data, f.path)
  if (f.type === 'taxon') {
    const t = (data as Encounter).taxon
    v = ID_BASIS[t.idBasis] ?? t.idBasis
  }
  const n = typeof v === 'number' ? v : v && typeof v === 'object' && typeof (v as { value?: unknown }).value === 'number' ? (v as { value: number }).value : undefined
  const unit = (v && typeof v === 'object' ? (v as { unit?: string }).unit : undefined) ?? f.unit
  const label = f.type === 'taxon' ? 'Identified' : shortLabel(f.label)
  return (
    <div className={`fk-fld${flagged ? ' fk-fld--flag' : ''}${edited ? ' hq-fld--edit' : ''}`}>
      <span>
        {flagged && <Icon name="flag" />}
        {edited && <Icon name="pencil" />}
        {label}
      </span>
      {n !== undefined && f.type !== 'choice' ? (
        <b>
          {fmtNumber(n)}
          {unit && <small>{UNIT_LABEL[unit] ?? unit}</small>}
        </b>
      ) : (
        <b className="hq-fld-text">{f.type === 'time' && typeof v === 'string' ? v.slice(11, 16) : fmtValue(v, f, project)}</b>
      )}
    </div>
  )
}

function Fields({ row, fields, project }: { row: RecordRow; fields: FieldDef[]; project?: Project }) {
  const data = row.data
  const flaggedPaths = new Set((row.hq?.ranges ?? []).map((r) => r.fieldPath))
  const shown = fields.filter((f) => f.type !== 'location' && f.type !== 'photos' && f.type !== 'transect' && f.path !== 'distanceAlongM' && valueAt(data, f.path) !== undefined && valueAt(data, f.path) !== '')
  const groups = new Map<string, FieldDef[]>()
  for (const f of shown) groups.set(f.group, [...(groups.get(f.group) ?? []), f])
  const notes = shown.filter((f) => f.type === 'text' && f.group === 'notes')
  return (
    <>
      <h4 className="fk-gt">Fields</h4>
      <div className="fk-group">
        <div className="fk-card">
          {[...groups.entries()]
            .filter(([g]) => g !== 'notes')
            .map(([group, fs]) => (
              <div key={group}>
                <p className="hq-fgl">{GROUP_LABEL[group] ?? group}</p>
                <div className="fk-fields">
                  {fs.map((f) => (
                    <Tile key={f.key} f={f} data={data} project={project} flagged={flaggedPaths.has(f.path)} />
                  ))}
                </div>
              </div>
            ))}
          {row.recordType === 'survey' && <SurveyWorkedOut s={data as Survey} />}
          {notes.map((f) => (
            <div key={f.key}>
              <p className="hq-fgl">{f.label}</p>
              <p className="hq-fnote" style={{ color: 'var(--ink)', fontSize: 14 }}>
                {String(valueAt(data, f.path))}
              </p>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

function SurveyWorkedOut({ s }: { s: Survey }) {
  return (
    <div>
      <p className="hq-fgl">Worked out on the phone</p>
      <div className="fk-fields">
        <div className="fk-fld">
          <span>Effort</span>
          <b>
            {s.effortPersonHours !== undefined ? fmtNumber(s.effortPersonHours) : '—'}
            <small>person-hours</small>
          </b>
        </div>
        {s.astro && (
          <>
            <div className="fk-fld">
              <span>After sunset</span>
              <b>
                {s.astro.minutesAfterSunsetAtStart}
                <small>min</small>
              </b>
            </div>
            <div className="fk-fld">
              <span>Moon lit</span>
              <b>
                {s.astro.moonIlluminationPct}
                <small>%</small>
              </b>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function KeyRun({ e }: { e: Encounter }) {
  const k = e.taxon.keyRun
  if (!k || !k.candidates.length) return null
  return (
    <>
      <h4 className="fk-gt">Scale key on the phone</h4>
      <div className="fk-group">
        <div className="fk-card hq-ver">
          {k.candidates.slice(0, 3).map((c) => (
            <div key={c.taxonId} className="hq-ver__row">
              <b className="fk-sp">{c.scientificName}</b>
              <span>score {Math.round(c.score * 100)}%</span>
              {c.dangerous && (
                <>
                  {' '}
                  <Tag kind="venom">VENOMOUS</Tag>
                </>
              )}
              <p>
                {c.matched.length} match · {c.conflicts.length} conflict · {c.unknown.length} no data
              </p>
            </div>
          ))}
          {k.checkNext && <p className="hq-fnote">Check this next: {TRAIT_LABEL[k.checkNext].toLowerCase()}</p>}
        </div>
      </div>
    </>
  )
}

/**
 * What the surveyor photographed ("Image taken"), beside the species pack's own photo of that species for comparison.
 * The pack photo came in the set-up bundle and is stored in HQ, so it shows with no internet; its credit shows with it.
 */
function Photos({ recordId, taxonId, speciesName }: { recordId: string; taxonId?: string; speciesName?: string }) {
  const photos = useLiveQuery(() => db.photos.where('recordId').equals(recordId).toArray(), [recordId]) ?? []
  const ref = useLiveQuery(() => (taxonId ? db.speciesPhotos.get(taxonId) : undefined), [taxonId])
  const urls = useMemo(() => photos.map((p) => URL.createObjectURL(new Blob([p.bytes as BlobPart], { type: 'image/jpeg' }))), [photos])
  const refUrl = useMemo(() => (ref ? URL.createObjectURL(new Blob([ref.bytes as BlobPart], { type: 'image/jpeg' })) : undefined), [ref])
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls])
  useEffect(
    () => () => {
      if (refUrl) URL.revokeObjectURL(refUrl)
    },
    [refUrl],
  )
  if (!photos.length && !ref) return null
  return (
    <div className="fk-group hq-photos-g">
      <div className="hq-photos">
        {photos.map((p, i) => (
          <figure key={p.key} className="fk-card">
            <img src={urls[i]} alt={`${p.meta.role ?? 'Photo'} of the animal, taken in the field`} />
            <figcaption>
              <b>Image taken</b>
              <span>
                {p.meta.role ?? 'photo'} · {p.meta.takenAt.slice(11, 16)}
              </span>
            </figcaption>
          </figure>
        ))}
        {!photos.length && (
          <figure className="fk-card hq-photos__none">
            <span className="hq-photos__ph">
              <Icon name="camera" />
            </span>
            <figcaption>
              <b>Image taken</b>
              <span>No photo with this record</span>
            </figcaption>
          </figure>
        )}
        {ref && refUrl && (
          <figure className="fk-card">
            <img src={refUrl} alt={`${speciesName ?? 'The species'}, reference photo from the species pack`} />
            <figcaption>
              <b>Species pack</b>
              <span>{ref.meta.credit}</span>
            </figcaption>
          </figure>
        )}
      </div>
    </div>
  )
}

function EditedDiff({ row, labelOf }: { row: RecordRow; labelOf: (p: string) => string }) {
  const reviewed = useLiveQuery(() => (row.reviewedRev ? db.revisions.get(`${row.key}:${row.reviewedRev}`) : undefined), [row.key, row.reviewedRev])
  if (!reviewed) return null
  const lines = diffRecords(reviewed.data, row.data)
  return (
    <section className="fk-group hq-changed" aria-label="Changed since you reviewed it">
      <p className="fk-hint">
        <Icon name="pencil" />
        <b>
          Changed since you reviewed version {row.reviewedRev} (now version {row.rev})
        </b>
      </p>
      <DiffTable lines={lines} labelOf={labelOf} />
    </section>
  )
}

function DiffTable({ lines, labelOf }: { lines: ReturnType<typeof diffRecords>; labelOf: (p: string) => string }) {
  if (!lines.length) return <p className="hq-fnote">No field changed, only the version number.</p>
  return (
    <table className="fk-diff">
      <thead>
        <tr>
          <th>Field</th>
          <th>Before</th>
          <th>After</th>
        </tr>
      </thead>
      <tbody>
        {lines.map((l) => {
          const base = l.path.split('.').slice(0, -1).join('.')
          const label = labelOf(l.path) !== l.path ? labelOf(l.path) : labelOf(base) !== base && base ? `${labelOf(base)} (${l.path.split('.').pop()})` : l.path
          return (
            <tr key={l.path}>
              <td>{label}</td>
              <td>
                <del>{fmtValue(l.before)}</del>
              </td>
              <td>
                <ins>{fmtValue(l.after)}</ins>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function Versions({ row, labelOf }: { row: RecordRow; labelOf: (p: string) => string }) {
  const revs = useLiveQuery(() => db.revisions.where('recordKey').equals(row.key).sortBy('rev'), [row.key, row.rev]) ?? []
  const files = useLiveQuery(async () => new Map((await db.bundles.toArray()).map((b) => [b.sha256, b.fileName])), [row.key, row.rev]) ?? new Map<string, string>()
  const [open, setOpen] = useState<number | undefined>()
  const [raw, setRaw] = useState(false)
  return (
    <>
      <h4 className="fk-gt">Versions received</h4>
      <div className="fk-group">
        <div className="fk-card hq-ver">
          {[...revs].reverse().map((r) => {
            const i = revs.indexOf(r)
            return (
              <div key={r.key} className="hq-ver__row">
                <b>Version {r.rev}</b>
                <span>{r.rev === row.rev ? 'current' : r.rev === row.reviewedRev ? 'history · the version you reviewed' : 'history'}</span>
                <p>
                  Received {shortTime(r.receivedAt)}
                  {files.get(r.bundleSha) ? (
                    <>
                      {' '}
                      in <span className="hq-nw">{files.get(r.bundleSha)}</span>
                    </>
                  ) : null}
                  .{i === 0 ? ' The first version HQ received.' : ''}{' '}
                  {i > 0 && (
                    <button className="hq-textlink" onClick={() => setOpen(open === r.rev ? undefined : r.rev)} style={{ fontWeight: 500 }}>
                      {open === r.rev ? 'Hide changes' : 'What changed'}
                    </button>
                  )}
                </p>
                {open === r.rev && i > 0 && <DiffTable lines={diffRecords(revs[i - 1]!.data, r.data)} labelOf={labelOf} />}
              </div>
            )
          })}
          <button className="hq-link" onClick={() => setRaw(!raw)}>
            {raw ? 'Hide the raw record' : 'Show the raw record'}
          </button>
          {raw && <pre className="hq-raw">{JSON.stringify(row.data, null, 2)}</pre>}
        </div>
      </div>
    </>
  )
}
