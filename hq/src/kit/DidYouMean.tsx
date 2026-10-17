// The "Did you mean?" card, HQ density (handoff §1.5): the AI reviewer's draft correction, old → new with the
// changed characters marked, the effect in a mint line, then Approve draft / Discard. After a decision it folds
// to one line. Nothing changes on a record here: an approved correction goes to the surveyor to accept.

import { useState, type ReactNode } from 'react'
import type { Encounter, Location, Project, SpeciesPack } from '@sciworks/shared'
import type { CorrectionRow, RecordRow } from '../db'
import { fmtNumber, UNIT_LABEL } from '../lib/format'
import { approveDraft, discardDraft } from '../lib/review'
import { personName } from '../lib/setup'
import { shortTime } from '../lib/time'
import { Icon, Mark } from './Icons'
import { AiTags, WithSpecies } from './ui'

/** Marks what changed between two strings: the old side's removed run, the new side's added run. */
export function CharDiff({ from, to }: { from: string; to: string }): { old: ReactNode; new: ReactNode } {
  let p = 0
  while (p < from.length && p < to.length && from[p] === to[p]) p++
  let s = 0
  while (s < from.length - p && s < to.length - p && from[from.length - 1 - s] === to[to.length - 1 - s]) s++
  const oldMid = from.slice(p, from.length - s)
  const newMid = to.slice(p, to.length - s)
  return {
    old: (
      <>
        {from.slice(0, p)}
        {oldMid && <mark className={`fk-cut${newMid ? '' : ' fk-cut--gone'}`}>{oldMid}</mark>}
        {from.slice(from.length - s)}
      </>
    ),
    new: (
      <>
        {to.slice(0, p)}
        {newMid && <mark className="fk-add">{newMid}</mark>}
        {to.slice(to.length - s)}
      </>
    ),
  }
}

/** Digits with thousands commas, keeping the diff marks in place: "4,35[0]" → "435". */
function Num({ from, to }: { from: number; to: number }) {
  const raw = (n: number) => String(Number(n.toFixed(2)))
  const withCommas = (r: string) => {
    const [int, dec] = r.split('.')
    return int!.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (dec ? `.${dec}` : '')
  }
  // Diff on the bare digits, then print with commas: commas sit outside the marked run when they can.
  const a = raw(from)
  const b = raw(to)
  if (a.replace(/\D/g, '').length >= 4 || b.replace(/\D/g, '').length >= 4) {
    const fa = withCommas(a)
    const fb = withCommas(b)
    // Map the bare-digit diff onto the formatted strings.
    let p = 0
    while (p < a.length && p < b.length && a[p] === b[p]) p++
    let s = 0
    while (s < a.length - p && s < b.length - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++
    const mapIdx = (formatted: string, i: number) => {
      let seen = 0
      for (let k = 0; k < formatted.length; k++) {
        if (seen === i) return k
        if (formatted[k] !== ',') seen++
      }
      return formatted.length
    }
    const cut = (f: string, start: number, end: number) => [f.slice(0, mapIdx(f, start)), f.slice(mapIdx(f, start), mapIdx(f, end)), f.slice(mapIdx(f, end))]
    const [o1, o2, o3] = cut(fa, p, a.length - s)
    const [n1, n2, n3] = cut(fb, p, b.length - s)
    return {
      old: (
        <>
          {o1}
          {o2 && <mark className={`fk-cut${n2 ? '' : ' fk-cut--gone'}`}>{o2}</mark>}
          {o3}
        </>
      ),
      new: (
        <>
          {n1}
          {n2 && <mark className="fk-add">{n2}</mark>}
          {n3}
        </>
      ),
    }
  }
  return CharDiff({ from: a, to: b })
}

const asNumber = (v: unknown): number | undefined =>
  typeof v === 'number' ? v : v && typeof v === 'object' && typeof (v as { value?: unknown }).value === 'number' ? (v as { value: number }).value : undefined

function unitOf(v: unknown): string {
  const u = v && typeof v === 'object' ? (v as { unit?: string }).unit : undefined
  return u ? (UNIT_LABEL[u] ?? u) : ''
}

/** The one line in mint that says what the fix does, when a checker can say it. */
function effectOf(c: CorrectionRow, row: RecordRow, pack?: SpeciesPack): string | undefined {
  if (c.fieldPath === 'location') {
    const loc = c.proposed as Location | undefined
    const chk = loc?.check
    if (chk && chk.band === 'green') return `${fmtNumber(chk.offsetM, 1)} m from the line · ${fmtNumber(chk.chainageM, 0)} m along`
    return undefined
  }
  if (row.recordType !== 'encounter') return undefined
  const e = row.data as Encounter
  const taxon = e.taxon.taxonId ? pack?.taxa.find((t) => t.taxonId === e.taxon.taxonId) : undefined
  const range = c.fieldPath === 'svl' ? taxon?.sizeRanges?.svlMm : c.fieldPath === 'mass' ? taxon?.sizeRanges?.massG : undefined
  const v = asNumber(c.proposed)
  if (!range || v === undefined) return undefined
  const inside = (range.min === undefined || v >= range.min) && (range.max === undefined || v <= range.max)
  if (!inside) return undefined
  const unit = c.fieldPath === 'svl' ? 'mm' : 'g'
  return `Inside the pack range (${range.max !== undefined ? `max ${fmtNumber(range.max, 0)} ${unit}` : `min ${fmtNumber(range.min!, 0)} ${unit}`}).`
}

function Change({ c, label }: { c: CorrectionRow; label: string }) {
  if (c.fieldPath === 'location') {
    const from = c.current as Location | undefined
    const to = c.proposed as Location | undefined
    if (!from || !to) return null
    const lat = CharDiff({ from: from.lat.toFixed(6), to: to.lat.toFixed(6) })
    const lon = CharDiff({ from: from.lon.toFixed(6), to: to.lon.toFixed(6) })
    return (
      <div className="fk-dym__change">
        <span className="fk-dym__lbl">{label}</span>
        <span className="fk-dym__old">
          {lat.old}, {lon.old}
        </span>
        <Icon name="arrow" />
        <span className="fk-dym__new" style={{ fontSize: 17 }}>
          {lat.new}, {lon.new}
        </span>
      </div>
    )
  }
  const a = asNumber(c.current)
  const b = asNumber(c.proposed)
  const unit = unitOf(c.proposed) || unitOf(c.current)
  if (a !== undefined && b !== undefined) {
    const d = Num({ from: a, to: b })
    return (
      <div className="fk-dym__change">
        <span className="fk-dym__lbl">{label}</span>
        <span className="fk-dym__old">
          {d.old}
          {unit && <span className="fk-dym__unit">{unit}</span>}
        </span>
        <Icon name="arrow" />
        <span className="fk-dym__new">
          {d.new}
          {unit && <span className="fk-dym__unit">{unit}</span>}
        </span>
      </div>
    )
  }
  const d = CharDiff({ from: String(c.current ?? '—'), to: String(c.proposed ?? '') })
  return (
    <div className="fk-dym__change">
      <span className="fk-dym__lbl">{label}</span>
      <span className="fk-dym__old">{d.old}</span>
      <Icon name="arrow" />
      <span className="fk-dym__new" style={{ fontSize: 20 }}>
        {d.new}
      </span>
    </div>
  )
}

export function DraftCard({ c, row, label, me, pack }: { c: CorrectionRow; row: RecordRow; label: string; me: string; pack?: SpeciesPack }) {
  const [editing, setEditing] = useState(false)
  const [proposed, setProposed] = useState(String(asNumber(c.proposed) ?? (typeof c.proposed === 'string' ? c.proposed : JSON.stringify(c.proposed))))
  const [reason, setReason] = useState(c.reason)
  const effect = effectOf(c, row, pack)
  const approve = () => {
    let next: unknown = undefined
    if (editing) {
      const n = Number(proposed)
      if (asNumber(c.proposed) !== undefined && Number.isFinite(n)) next = typeof c.proposed === 'number' ? n : { ...(c.proposed as object), value: n }
      else if (typeof c.proposed === 'string') next = proposed
    }
    void approveDraft(c.correctionId, me, { ...(next !== undefined ? { proposed: next } : {}), ...(editing ? { reason } : {}) })
  }
  return (
    <section className="fk-group fk-dym fk-dym--hq" aria-label="Did you mean? AI reviewer draft">
      <div className="fk-dym__head">
        <h3 className="fk-dym__title">Did you mean?</h3>
        {c.source === 'ai-agent' ? <AiTags /> : <span className="fk-tag fk-tag--draft">Draft</span>}
      </div>
      <p className="fk-dym__what">
        <WithSpecies text={c.reason} names={[row.recordType === 'encounter' ? (row.data as Encounter).taxon.scientificName : undefined]} />
      </p>
      <div className="fk-card fk-dym__body">
        <Change c={c} label={label} />
        {effect && (
          <p className="fk-dym__effect">
            <Mark band="on" />
            {effect}
          </p>
        )}
        {editing && (
          <div className="hq-dym-edit">
            {asNumber(c.proposed) !== undefined || typeof c.proposed === 'string' ? (
              <label>
                Proposed {unitOf(c.proposed) ? `(${unitOf(c.proposed)})` : ''}
                <input className="hq-input" value={proposed} onChange={(e) => setProposed(e.target.value)} inputMode="decimal" />
              </label>
            ) : null}
            <label>
              Why (the surveyor reads this)
              <textarea className="hq-input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
            </label>
          </div>
        )}
      </div>
      <div className="fk-dym__actions">
        <button className="fk-btn fk-btn--primary" onClick={approve}>
          Approve draft
        </button>
        <button className="fk-btn fk-btn--secondary" onClick={() => void discardDraft(c.correctionId)}>
          Discard
        </button>
      </div>
      <p className="fk-dym__fine">Goes to the surveyor to accept. Nothing changes until they do.</p>
      <div className="fk-dym__links" style={{ justifyContent: 'flex-end', padding: '0 6px 4px' }}>
        <button className="hq-textlink" onClick={() => setEditing(!editing)} style={{ fontSize: 13, fontWeight: 500 }}>
          {editing ? 'Done editing' : 'Edit before approving'}
        </button>
      </div>
    </section>
  )
}

/** After the decision: one line. */
export function DecidedCard({ c, label, project }: { c: CorrectionRow; label: string; project?: Project }) {
  const by = personName(project, c.approvedBy)
  return (
    <section className="fk-group" aria-label="Correction sent">
      <div className="fk-card fk-dym-done fk-dym-done--hq">
        <Mark band="on" />
        <p className="fk-dym-done__title">
          {label}: {fmtProposed(c)}
        </p>
        <p className="fk-dym-done__text">
          {c.source === 'ai-agent' ? `Drafted by the AI reviewer, approved by ${by}` : `Approved by ${by}`}, {shortTime(c.approvedAt)}. Goes in the next bundle.
        </p>
      </div>
    </section>
  )
}

function fmtProposed(c: CorrectionRow): string {
  if (c.fieldPath === 'location') {
    const l = c.proposed as Location | undefined
    return l ? `${l.lat.toFixed(6)}, ${l.lon.toFixed(6)}` : '—'
  }
  const n = asNumber(c.proposed)
  return n !== undefined ? `${fmtNumber(n)}${unitOf(c.proposed) ? ` ${unitOf(c.proposed)}` : ''}` : String(c.proposed ?? '—')
}
