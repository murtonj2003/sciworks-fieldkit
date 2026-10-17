// The Data Manager writes a correction request. It goes to the phone in the next HQ bundle; the surveyor
// accepts (a new rev) or declines. HQ never changes the record itself.

import { useMemo, useState } from 'react'
import { checkCoordinate, type Encounter, type FieldDef, type Location, type Overlay, type Template } from '@sciworks/shared'
import type { RecordRow } from '../db'
import { fieldsFor, fmtValue } from '../lib/format'
import { createCorrection, getPath } from '../lib/review'
import { loadSetup, transectById } from '../lib/setup'

interface Props {
  row: RecordRow
  template?: Template
  overlay?: Overlay
  me: string
  onDone: () => void
}

const EDITABLE: FieldDef['type'][] = ['measurement', 'number', 'choice', 'text', 'boolean', 'location']

function initialField(row: RecordRow, fields: FieldDef[]): string {
  const range = row.hq?.ranges[0]?.fieldPath
  if (range && fields.some((f) => f.path === range)) return range
  if (row.recordType === 'encounter' && row.hq?.coord && row.hq.coord.band !== 'green') return 'location'
  return fields[0]?.path ?? ''
}

export function CorrectionForm({ row, template, overlay, me, onDone }: Props) {
  const fields = useMemo(() => fieldsFor(row.recordType, template, overlay).filter((f) => EDITABLE.includes(f.type)), [row.recordType, template, overlay])
  const [path, setPath] = useState(() => initialField(row, fields))
  const field = fields.find((f) => f.path === path)
  const current = getPath(row.data, path)
  const suggestion = row.hq?.coord?.suggestions[0]
  const [text, setText] = useState('')
  const [lat, setLat] = useState(suggestion ? String(suggestion.lat) : '')
  const [lon, setLon] = useState(suggestion ? String(suggestion.lon) : '')
  const [reason, setReason] = useState(() => (path === 'location' && suggestion ? suggestion.explain : (row.hq?.ranges[0]?.message ?? '')))
  const [error, setError] = useState('')

  async function proposedValue(): Promise<unknown> {
    if (!field) throw new Error('Pick a field.')
    if (field.type === 'location') {
      const la = Number(lat)
      const lo = Number(lon)
      if (!Number.isFinite(la) || !Number.isFinite(lo)) throw new Error('Type a latitude and longitude in decimal degrees.')
      const loc = (row.data as Encounter).location
      const setup = await loadSetup()
      const transect = transectById(setup, row.transectId)
      const check = transect && setup.project ? checkCoordinate({ lat: la, lon: lo, accuracyM: loc.accuracyM }, transect, setup.project) : loc.check
      const next: Location = { ...loc, lat: la, lon: lo, original: loc.original ?? { lat: loc.lat, lon: loc.lon }, check }
      return next
    }
    if (field.type === 'measurement') {
      const n = Number(text)
      if (!Number.isFinite(n)) throw new Error('Type a number.')
      const cur = (current as object | undefined) ?? { unit: field.unit }
      return { ...cur, value: n }
    }
    if (field.type === 'number') {
      const n = Number(text)
      if (!Number.isFinite(n)) throw new Error('Type a number.')
      return n
    }
    if (field.type === 'boolean') return text === 'true'
    if (field.type === 'choice') return field.valueType === 'number' ? Number(text) : text
    return text
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!reason.trim()) return setError('Say why, in plain words. The surveyor reads it.')
    try {
      await createCorrection({ key: row.key, fieldPath: path, proposed: await proposedValue(), reason: reason.trim(), by: me })
      onDone()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <form className="panel correction-form" onSubmit={submit}>
      <h3>Send a correction to the surveyor</h3>
      <label>
        Field
        <select value={path} onChange={(e) => (setPath(e.target.value), setText(''))}>
          {fields.map((f) => (
            <option key={f.key} value={f.path}>
              {f.label}
            </option>
          ))}
        </select>
      </label>
      <p className="muted small">Now: {fmtValue(current, field)}</p>
      {field?.type === 'location' ? (
        <div className="row">
          <label>
            Latitude
            <input value={lat} onChange={(e) => setLat(e.target.value)} inputMode="decimal" />
          </label>
          <label>
            Longitude
            <input value={lon} onChange={(e) => setLon(e.target.value)} inputMode="decimal" />
          </label>
        </div>
      ) : field?.type === 'choice' ? (
        <label>
          Proposed
          <select value={text} onChange={(e) => setText(e.target.value)}>
            <option value="">Choose…</option>
            {field.choices?.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
      ) : field?.type === 'boolean' ? (
        <label>
          Proposed
          <select value={text} onChange={(e) => setText(e.target.value)}>
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
        </label>
      ) : (
        <label>
          Proposed {field?.unit ? `(${field.unit})` : ''}
          <input value={text} onChange={(e) => setText(e.target.value)} autoFocus />
        </label>
      )}
      <label>
        Why
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
      </label>
      {error && <p className="error">{error}</p>}
      <div className="detail-actions">
        <button className="btn btn-approve" type="submit">
          Approve and queue for the phone
        </button>
        <button className="btn btn-quiet" type="button" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  )
}
