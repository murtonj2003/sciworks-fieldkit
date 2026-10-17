// "Check a list of points" (Susie's aguada outline). Paste "label, lat, lon" lines; each point is checked against
// the outline through the others. Nothing pasted is saved: close the panel and it is gone.

import { useEffect, useMemo, useState } from 'react'
import type { Project } from '@sciworks/shared'
import { fmtLatLon, fmtNumber } from '../lib/format'
import { checkPointList, parsePointList } from '../lib/pointList'

const BAND = { green: '● On the outline', amber: '▲ Near, check', red: '◆ Far off', 'outside-bbox': '◆ Outside the area' } as const

export function PointsDialog({ project, onClose }: { project: Project; onClose: () => void }) {
  const [text, setText] = useState('')
  const [closed, setClosed] = useState(true)
  const parsed = useMemo(() => parsePointList(text), [text])
  const results = useMemo(() => checkPointList(parsed.points, project, { closed }), [parsed.points, project, closed])

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-wide" role="dialog" aria-modal="true" aria-label="Check a list of points" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2>Check a list of points</h2>
          <button className="btn btn-quiet" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>
        <p className="muted">
          For points that should sit together, like a pond outline walked one bend at a time. Each point is checked against the outline through the
          others, with the same "did you mean?" as a transect. Nothing you paste is saved.
        </p>
        <label className="correction-form">
          One point per line: label, latitude, longitude (decimal degrees)
          <textarea rows={8} className="input-wide" value={text} onChange={(e) => setText(e.target.value)} placeholder={'N, 10.432600, -84.004000\nNE, 10.432100, -84.003000\n…'} spellCheck={false} />
        </label>
        <label className="inline small">
          <input type="checkbox" checked={closed} onChange={(e) => setClosed(e.target.checked)} /> The points go round a closed outline (last joins first)
        </label>
        {parsed.errors.map((e) => (
          <p key={e} className="error small">
            {e}
          </p>
        ))}
        {parsed.points.length > 0 && parsed.points.length < 4 && <p className="muted">Add at least 4 points to compare them.</p>}
        {results.length > 0 && (
          <table className="table">
            <thead>
              <tr>
                <th>Point</th>
                <th>As typed</th>
                <th>Check</th>
                <th>From the middle</th>
                <th>Did you mean?</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => {
                const p = parsed.points.find((x) => x.id === r.id)!
                return (
                  <tr key={r.id}>
                    <td>
                      <b>{r.label}</b>
                    </td>
                    <td>
                      <code>{fmtLatLon(p.lat, p.lon)}</code>
                    </td>
                    <td>
                      {r.check ? BAND[r.check.band] : '—'}
                      {r.check ? <span className="muted small"> · {fmtNumber(r.check.offsetM, 0)} m from the outline</span> : null}
                      {r.outlier ? <span className="tag tag-warn">far from the rest</span> : null}
                    </td>
                    <td>{fmtNumber(r.fromCentreM, 0)} m</td>
                    <td className="small">
                      {!r.check?.suggestions.length ? (
                        '—'
                      ) : r.outlier || r.check.band === 'red' ? (
                        <Fixes s={r.check.suggestions} />
                      ) : (
                        // A point that is only near the outline usually just sits on a bend: keep its guesses folded away.
                        <details>
                          <summary className="muted">{r.check.suggestions.length} possible fix{r.check.suggestions.length === 1 ? '' : 'es'} (probably not needed)</summary>
                          <Fixes s={r.check.suggestions} />
                        </details>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function Fixes({ s }: { s: { explain: string; lat: number; lon: number; offsetM: number }[] }) {
  return (
    <>
      {s.map((x, i) => (
        <div key={i}>
          {x.explain} → <code>{fmtLatLon(x.lat, x.lon)}</code>, {fmtNumber(x.offsetM, 0)} m from the outline
        </div>
      ))}
    </>
  )
}
