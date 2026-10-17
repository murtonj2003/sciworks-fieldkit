// "Check a list of points" (wireframe H4a; Susie's aguada outline). Paste "label, lat, lon" lines; each point is
// checked against the outline through the others with the shared checkPointSet(). Nothing pasted is saved.

import { useMemo, useState } from 'react'
import type { Project } from '@sciworks/shared'
import { CharDiff } from '../kit/DidYouMean'
import { Icon, Mark } from '../kit/Icons'
import { BAND_MARK, BAND_WORD, fmtNumber } from '../lib/format'
import { checkPointList, parsePointList } from '../lib/pointList'

export function PointsScreen({ project }: { project: Project }) {
  const [text, setText] = useState('')
  const [checked, setChecked] = useState('')
  const [closed, setClosed] = useState(true)
  const parsed = useMemo(() => parsePointList(checked), [checked])
  const results = useMemo(() => checkPointList(parsed.points, project, { closed }), [parsed.points, project, closed])
  const off = results.filter((r) => r.outlier || r.check?.band === 'red').length
  // One Shout: only the farthest-off point gets the solid red pill; any other far-off point uses the tint.
  const shoutId = results
    .filter((r) => r.outlier || r.check?.band === 'red')
    .sort((a, b) => (b.check?.offsetM ?? b.fromCentreM) - (a.check?.offsetM ?? a.fromCentreM))[0]?.id

  return (
    <div className="pg-cols pg-cols--pts">
      <section className="fk-col" aria-label="Points to check">
        <div className="fk-col-h">
          <h3>Check a list of points</h3>
          <span>Nothing you paste is saved.</span>
        </div>
        <div className="pg-scroll">
          <p className="fk-small" style={{ margin: '0 6px 10px' }}>
            For points that should sit together, like a pond outline walked one bend at a time. Each point is checked against the outline through the
            others, with the same "Did you mean?" as a transect.
          </p>
          <form
            className="fk-group pg-paste"
            onSubmit={(e) => {
              e.preventDefault()
              setChecked(text)
            }}
          >
            <textarea
              aria-label="Points, one per line: label, latitude, longitude"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={'label, lat, lon — one point per line\nN, 10.432600, -84.004000\nNE, 10.432100, -84.003000'}
              spellCheck={false}
            />
            <div className="pg-paste__foot">
              <label className="hq-check fk-help">
                <input type="checkbox" checked={closed} onChange={(e) => setClosed(e.target.checked)} />
                Closed outline (the last point joins the first)
              </label>
              <button className="fk-btn fk-btn--primary fk-btn--36" type="submit" disabled={!text.trim()}>
                <Icon name="crosshair" />
                Check points
              </button>
            </div>
          </form>
          {parsed.errors.map((e) => (
            <p key={e} className="fk-error">
              <Icon name="warning" />
              {e}
            </p>
          ))}
          {parsed.points.length > 0 && parsed.points.length < 4 && <p className="fk-help">Add at least 4 points to compare them.</p>}
        </div>
      </section>

      <section className="fk-col" aria-label="Results">
        <div className="fk-col-h">
          <h3>Results</h3>
          <span>{results.length ? `${results.length} points · ${off} off the outline` : 'Paste points and press Check points'}</span>
        </div>
        <div className="pg-scroll">
          {results.length > 0 ? (
            <div className="fk-group">
              <table className="hq-table pg-pts">
                <thead>
                  <tr>
                    <th>Point</th>
                    <th>Check</th>
                    <th>From the outline</th>
                    <th>Did you mean?</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r) => {
                    const p = parsed.points.find((x) => x.id === r.id)!
                    const band = r.check?.band
                    const loud = r.outlier || band === 'red'
                    const shout = r.id === shoutId
                    return (
                      <tr key={r.id}>
                        <td>{r.label}</td>
                        <td>
                          {band && loud ? (
                            <span className={`fk-band ${shout ? 'fk-band--off' : 'fk-band--off-quiet'}`}>
                              <Mark band="off" />
                              {BAND_WORD.red}
                            </span>
                          ) : band ? (
                            <span className="fk-bandtext">
                              <Mark band={BAND_MARK[band]} size={16} />
                              {BAND_WORD[band]}
                            </span>
                          ) : (
                            <span className="hq-dim">Too few other points</span>
                          )}
                        </td>
                        <td>{r.check ? shout ? <b>{fmtNumber(r.check.offsetM, 0)} m</b> : `${fmtNumber(r.check.offsetM, 0)} m` : '—'}</td>
                        <td className="pg-sug">
                          {!r.check?.suggestions.length ? (
                            <span className="hq-dim">None needed</span>
                          ) : loud ? (
                            <Fixes raw={p.typed?.raw} s={r.check.suggestions} />
                          ) : (
                            <details>
                              <summary>
                                <Icon name="chev-down" />
                                {r.check.suggestions.length} possible fix{r.check.suggestions.length === 1 ? '' : 'es'} (probably not needed: it sits on a bend)
                              </summary>
                              <Fixes raw={p.typed?.raw} s={r.check.suggestions} />
                            </details>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="fk-group">
              <div className="fk-card fk-empty pg-col-empty">
                <b>No points checked yet.</b>
                Made-up points work for a demo. Use real site points only with the surveyor's OK.
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

function Fixes({ raw, s }: { raw?: string; s: { explain: string; lat: number; lon: number; offsetM: number; raw?: string }[] }) {
  return (
    <>
      {s.map((x, i) => {
        const to = x.raw ?? `${x.lat.toFixed(6)}, ${x.lon.toFixed(6)}`
        const d = raw ? CharDiff({ from: raw, to }) : undefined
        return (
          <div key={i} style={{ marginTop: i ? 10 : 0 }}>
            <div>{x.explain.replace(/\.$/, '')}</div>
            <div className="pg-sug__fix">
              {d ? (
                <>
                  <span className="pg-old">{d.old}</span>
                  <Icon name="arrow" />
                  <span>{d.new}</span>
                </>
              ) : (
                <span>{to}</span>
              )}
            </div>
            <div className="fk-dym__opt-eff" style={{ marginTop: 4 }}>
              <Mark band="on" />
              {fmtNumber(x.offsetM, 0)} m from the outline
            </div>
          </div>
        )
      })}
    </>
  )
}
