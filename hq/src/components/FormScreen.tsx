// Form control (wireframe H2), reached from the top bar's Form. Left: the published form, grouped by tier, with
// Hide / Show (fields are hidden, never deleted), Add a field, and the draft line with Publish. Right: team requests
// and species added in the field.

import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import type { FieldDef, Project, Template, Unit } from '@sciworks/shared'
import { db } from '../db'
import { Icon, Mark, type IconName } from '../kit/Icons'
import { ProvisionalCard } from '../kit/ProvisionalCard'
import {
  acceptChangeRequest,
  addField,
  declineChangeRequest,
  discardDraft,
  keyFromLabel,
  loadDraft,
  publishDraft,
  toggleHidden,
  type NewField,
} from '../lib/formAdmin'
import { UNIT_LABEL } from '../lib/format'
import { personName, teamName } from '../lib/setup'
import { shortTime } from '../lib/time'

const TIERS: { tier: FieldDef['tier']; label: string; icon: IconName }[] = [
  { tier: 'core', label: 'Core (HQ only)', icon: 'lock' },
  { tier: 'team', label: 'Team-tunable', icon: 'sliders' },
  { tier: 'free', label: 'Free', icon: 'pencil' },
]
const SHOW_FIRST = 6

interface Props {
  project?: Project
  template?: Template
  me: string
}

export function FormScreen({ project, template, me }: Props) {
  const provisional = useLiveQuery(() => db.provisionalTaxa.toArray(), [], [])
  const taxonDecisions = useLiveQuery(() => db.taxonDecisions.toArray(), [], [])
  const changeRequests = useLiveQuery(() => db.changeRequests.toArray(), [], [])
  const crDecisions = useLiveQuery(() => db.changeRequestDecisions.toArray(), [], [])
  const overlays = useLiveQuery(() => db.overlays.toArray(), [], [])
  const draft = useLiveQuery(() => loadDraft(), [], undefined)
  const pack = useLiveQuery(() => db.setup.get('speciesPack'), [], undefined)
  const [recordType, setRecordType] = useState<'encounter' | 'survey'>('encounter')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [message, setMessage] = useState<{ ok: boolean; text: string }>()
  const [published, setPublished] = useState<string>()

  const act = async (fn: () => Promise<unknown>, ok?: string) => {
    setMessage(undefined)
    try {
      await fn()
      if (ok) setMessage({ ok: true, text: ok })
    } catch (e) {
      setMessage({ ok: false, text: (e as Error).message })
    }
  }
  if (!template) return null

  const inDraft = draft?.baseVersion === template.coreVersion && draft.changes.length > 0
  const allFields = draft?.baseVersion === template.coreVersion ? draft.fields : template.fields
  const fields = allFields.filter((f) => f.recordType === recordType)
  const next = template.coreVersion + 1
  const count = (t: 'survey' | 'encounter') => allFields.filter((f) => f.recordType === t).length
  const taxonName = (id?: string) => (pack?.value as { taxa: { taxonId: string; scientificName: string }[] } | undefined)?.taxa.find((t) => t.taxonId === id)?.scientificName ?? id
  const fieldSpec = (teamId: string, key?: string) => overlays.map((o) => (o.teamId === teamId ? o.data.addedFields.find((f) => f.key === key) : undefined)).find(Boolean)

  const waiting = changeRequests.filter((c) => !crDecisions.some((d) => d.changeRequestId === c.changeRequestId) && !draft?.acceptedRequestIds.includes(c.changeRequestId))
  const decided = changeRequests.filter((c) => !waiting.includes(c))
  const openTaxa = provisional.filter((p) => !taxonDecisions.some((t) => t.provisionalTaxonId === p.provisionalTaxonId))
  const decidedTaxa = provisional.filter((p) => !openTaxa.includes(p))

  return (
    <div className="pg-cols pg-cols--form">
      <section className="fk-col" aria-label="Published form">
        <div className="fk-col-h">
          <h3>Published form</h3>
          <span>Fields are hidden, never deleted.</span>
        </div>
        <div className="pg-scroll">
          <div className="fk-group">
            <div className="pg-form__head">
              <div>
                <h4>
                  {template.templateId} · version {template.coreVersion}
                </h4>
                <p>
                  {template.fields.length} fields ({template.fields.filter((f) => f.recordType === 'survey').length} survey,{' '}
                  {template.fields.filter((f) => f.recordType === 'encounter').length} animal) · published {shortTime(template.publishedAt)}
                </p>
              </div>
              <div className="fk-seg fk-seg--sm" role="radiogroup" aria-label="Which form">
                <button role="radio" aria-checked={recordType === 'encounter'} onClick={() => setRecordType('encounter')}>
                  Animal form · {count('encounter')}
                </button>
                <button role="radio" aria-checked={recordType === 'survey'} onClick={() => setRecordType('survey')}>
                  Survey form · {count('survey')}
                </button>
              </div>
            </div>
            {TIERS.map(({ tier, label, icon }) => {
              const list = fields.filter((f) => f.tier === tier).sort((a, b) => a.order - b.order)
              if (!list.length) return null
              const open = expanded[tier] || list.length <= SHOW_FIRST + 1
              const shown = open ? list : list.slice(0, SHOW_FIRST)
              return (
                <div key={tier}>
                  <h4 className="fk-gt pg-gt">
                    <Icon name={icon} />
                    {label} <span>· {list.length} field{list.length === 1 ? '' : 's'}</span>
                  </h4>
                  <div className="fk-list">
                    {shown.map((f) => {
                      const isNew = f.addedInCore > template.coreVersion
                      return (
                        <div key={f.key} className={`pg-frow${f.hidden ? ' is-hidden' : ''}${isNew ? ' is-new' : ''}`}>
                          <span className="pg-frow__name">
                            {f.label}
                            {f.hidden && (
                              <span className="fk-tag">
                                <Icon name="eye-off" />
                                Hidden
                              </span>
                            )}
                            {isNew && (
                              <span className="fk-tag">
                                <Icon name="plus" />
                                Version {next} (draft)
                              </span>
                            )}
                          </span>
                          <span className="pg-frow__unit">{f.unit ? (UNIT_LABEL[f.unit] ?? f.unit) : 'none'}</span>
                          <span>
                            <span className="fk-tag">
                              <Icon name={icon} />
                              {label}
                            </span>
                          </span>
                          <span className="pg-frow__act">
                            <button className="fk-btn fk-btn--grey fk-btn--36" onClick={() => act(() => toggleHidden(f.key))}>
                              <Icon name={f.hidden ? 'eye' : 'eye-off'} />
                              {f.hidden ? 'Show' : 'Hide'}
                            </button>
                          </span>
                        </div>
                      )
                    })}
                    {!open && (
                      <button className="pg-frow pg-frow--more" onClick={() => setExpanded({ ...expanded, [tier]: true })}>
                        <Icon name="chev-down" />
                        {list.length - SHOW_FIRST} more {label.toLowerCase().replace(' (hq only)', '')} fields
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          <AddField recordType={recordType} next={next} act={act} />

          <div className="fk-group pg-draft">
            <div className="fk-card pg-draft__in">
              <span className="fk-tile">
                <Icon name="survey" />
              </span>
              <div className="pg-draft__text">
                {inDraft ? (
                  <>
                    <b>
                      Version {next} (draft): {draft!.changes.length} change{draft!.changes.length === 1 ? '' : 's'}
                    </b>
                    <ul>
                      {draft!.changes.map((c, i) => (
                        <li key={i}>{c}</li>
                      ))}
                    </ul>
                    <p>Phones get it in their next bundle. Older records keep version {template.coreVersion}; nothing is deleted.</p>
                  </>
                ) : published ? (
                  <>
                    <b>{published}</b>
                    <p>Make a bundle for each team to send it.</p>
                  </>
                ) : (
                  <>
                    <b>No changes waiting</b>
                    <p>Hide a field, add one, or accept a team request to start version {next}.</p>
                  </>
                )}
              </div>
              {inDraft && (
                <>
                  <button className="pg-textbtn" onClick={() => act(() => discardDraft(), 'Draft discarded.')}>
                    Discard draft
                  </button>
                  <button
                    className="fk-btn fk-btn--primary fk-btn--36"
                    onClick={() =>
                      act(async () => {
                        const t = await publishDraft(me)
                        setPublished(`Version ${t.coreVersion} published ${shortTime(t.publishedAt)}. Goes in each team's next bundle.`)
                      })
                    }
                  >
                    <Icon name="upload" />
                    Publish version {next}
                  </button>
                </>
              )}
            </div>
          </div>
          {message && (
            <p className={message.ok ? 'fk-success' : 'fk-error'} style={{ marginTop: 10 }}>
              {message.ok ? <Mark band="on" /> : <Icon name="warning" />}
              <span>{message.text}</span>
            </p>
          )}
        </div>
      </section>

      <section className="fk-col" aria-label="Team requests">
        <div className="fk-col-h">
          <h3>Team requests</h3>
          <span>{waiting.length + openTaxa.length} waiting</span>
        </div>
        <div className="pg-scroll">
          {waiting.length === 0 && openTaxa.length === 0 && (
            <div className="fk-group">
              <div className="fk-card fk-empty pg-col-empty">No team requests waiting.</div>
            </div>
          )}
          {waiting.length > 0 && (
            <div className="fk-group">
              {waiting.map((c) => {
                const spec = fieldSpec(c.teamId, c.data.fieldKey)
                return (
                  <article key={c.changeRequestId} className="fk-card pg-req">
                    <p className="pg-req__who">
                      <Icon name="users" />
                      {teamName(project, c.teamId)} · {personName(project, c.data.createdBy)} · {shortTime(c.data.createdAt)}
                    </p>
                    <h4>{c.data.proposal}</h4>
                    {spec && (
                      <p className="pg-req__spec">
                        <span className="fk-tag">{spec.type === 'number' ? 'Number' : spec.type === 'choice' ? 'Choice' : spec.type === 'boolean' ? 'Yes / no' : 'Text'}</span>
                        <span className="fk-tag">{spec.unit ? (UNIT_LABEL[spec.unit] ?? spec.unit) : 'no unit'}</span>
                        <span className="fk-tag">{spec.recordType === 'encounter' ? 'animal form' : 'survey form'}</span>
                      </p>
                    )}
                    {c.data.reason && <p className="pg-req__fine">Why: {c.data.reason}</p>}
                    <div className="pg-req__acts">
                      <button className="fk-btn fk-btn--primary fk-btn--36" onClick={() => act(() => acceptChangeRequest(c.changeRequestId), `Added to version ${next} (draft).`)}>
                        <Icon name="plus" />
                        Add to version {next}
                      </button>
                      <button
                        className="fk-btn fk-btn--grey fk-btn--36"
                        onClick={() => {
                          const note = window.prompt('Decline this request? Say why (the team sees it):', '')
                          if (note !== null) void act(() => declineChangeRequest(c.changeRequestId, me, note || undefined), 'Declined.')
                        }}
                      >
                        Decline
                      </button>
                    </div>
                    <p className="pg-req__fine">Records already made keep their value either way.</p>
                  </article>
                )
              })}
            </div>
          )}

          {openTaxa.length > 0 && <h4 className="fk-gt">Species added in the field</h4>}
          {openTaxa.map((p) => (
            <ProvisionalCard key={p.provisionalTaxonId} p={p.data} me={me} onDone={(t) => setMessage({ ok: true, text: `${p.data.proposedName}: ${t}.` })} />
          ))}

          {(decided.length > 0 || decidedTaxa.length > 0) && <h4 className="fk-gt">Decided</h4>}
          {(decided.length > 0 || decidedTaxa.length > 0) && (
            <div className="fk-group">
              {decided.map((c) => {
                const d = crDecisions.find((x) => x.changeRequestId === c.changeRequestId)
                return (
                  <article key={c.changeRequestId} className="fk-card pg-req pg-req--done">
                    <div>
                      <p className="pg-req__who">
                        <Icon name="users" />
                        {teamName(project, c.teamId)}
                      </p>
                      <h4>{c.data.proposal}</h4>
                      {d?.decision === 'declined' && d.note && <p className="pg-req__fine">"{d.note}"</p>}
                    </div>
                    {!d ? (
                      <span className="fk-tag">
                        <Icon name="plus" />
                        in version {next} (draft)
                      </span>
                    ) : d.decision === 'accepted' ? (
                      <span className="pg-tag-ok">
                        <Icon name="check" />
                        accepted in v{d.inCoreVersion}
                      </span>
                    ) : (
                      <span className="fk-tag">declined</span>
                    )}
                  </article>
                )
              })}
              {decidedTaxa.map((p) => {
                const d = taxonDecisions.find((t) => t.provisionalTaxonId === p.provisionalTaxonId)!
                return (
                  <article key={p.provisionalTaxonId} className="fk-card pg-req pg-req--done">
                    <div>
                      <p className="pg-req__who">
                        <Icon name="snake" />
                        {teamName(project, p.teamId)} · added in the field
                      </p>
                      <h4>"{p.data.proposedName}"</h4>
                    </div>
                    {d.decision === 'mapped' ? (
                      <span className="pg-tag-ok">
                        <Icon name="check" />
                        <span className="fk-sp">{taxonName(d.taxonId)}</span>
                      </span>
                    ) : d.decision === 'approved' ? (
                      <span className="pg-tag-prov">kept as provisional</span>
                    ) : (
                      <span className="fk-tag">rejected</span>
                    )}
                  </article>
                )
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

function AddField({ recordType, next, act }: { recordType: 'encounter' | 'survey'; next: number; act: (fn: () => Promise<unknown>, ok?: string) => Promise<void> }) {
  const [nf, setNf] = useState<NewField>({ recordType, label: '', type: 'number', tier: 'core' })
  const [choices, setChoices] = useState('')
  return (
    <>
      <h4 className="fk-gt">Add a field to version {next}</h4>
      <form
        className="fk-group"
        onSubmit={(e) => {
          e.preventDefault()
          void act(() => addField({ ...nf, recordType, choices: choices.split(',').map((c) => c.trim()).filter(Boolean) }), `Added "${nf.label}" to version ${next} (draft).`).then(() => {
            setNf({ ...nf, label: '', key: '' })
            setChoices('')
          })
        }}
      >
        <div className="pg-addfield">
          <label className="pg-wide">
            Name
            <input className="hq-input" value={nf.label} onChange={(e) => setNf({ ...nf, label: e.target.value })} placeholder="Number of individuals" />
          </label>
          <label className="pg-wide">
            Key (never changes)
            <input className="hq-input" value={nf.key ?? ''} onChange={(e) => setNf({ ...nf, key: e.target.value })} placeholder={keyFromLabel(nf.label) || 'made from the name'} />
          </label>
          <label>
            Type
            <select className="hq-input" value={nf.type} onChange={(e) => setNf({ ...nf, type: e.target.value as NewField['type'] })}>
              <option value="number">Number</option>
              <option value="text">Text</option>
              <option value="choice">Choice</option>
              <option value="boolean">Yes / no</option>
            </select>
          </label>
          <label>
            Unit
            <select className="hq-input" value={nf.unit ?? ''} onChange={(e) => setNf({ ...nf, unit: (e.target.value || undefined) as Unit | undefined })} disabled={nf.type !== 'number'}>
              <option value="">none (a count)</option>
              <option value="mm">mm</option>
              <option value="g">g</option>
              <option value="m">m</option>
              <option value="degC">°C</option>
              <option value="pct">%</option>
              <option value="h">h</option>
            </select>
          </label>
          <label className="pg-wide">
            Tier
            <select className="hq-input" value={nf.tier} onChange={(e) => setNf({ ...nf, tier: e.target.value as NewField['tier'] })}>
              <option value="core">Core (HQ only)</option>
              <option value="team">Team-tunable (a Team Lead may hide it)</option>
              <option value="free">Free</option>
            </select>
          </label>
          {nf.type === 'choice' && (
            <label className="pg-full">
              Choices, separated by commas
              <input className="hq-input" value={choices} onChange={(e) => setChoices(e.target.value)} placeholder="under log, on trunk, in water" />
            </label>
          )}
          <div className="pg-full" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button className="fk-btn fk-btn--grey fk-btn--36" type="submit" disabled={!nf.label.trim()}>
              <Icon name="plus" />
              Add to the draft
            </button>
            <span className="fk-help" style={{ margin: 0 }}>
              It goes on the {recordType === 'encounter' ? 'animal' : 'survey'} form. Phones store it with the record, so no phone update is needed.
            </span>
          </div>
        </div>
      </form>
    </>
  )
}
