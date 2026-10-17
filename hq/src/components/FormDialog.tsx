// Form & requests: species added in the field, teams' form requests, and the core form itself (W6).
// Plain components until the design handoff lands.

import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import type { FieldDef, Project, Template, TaxonMatch, Unit } from '@sciworks/shared'
import { db } from '../db'
import {
  acceptChangeRequest,
  addField,
  declineChangeRequest,
  decideProvisional,
  discardDraft,
  keyFromLabel,
  loadDraft,
  provisionalSuggestions,
  publishDraft,
  toggleHidden,
  type NewField,
  type TemplateDraft,
} from '../lib/formAdmin'
import { personName, teamName } from '../lib/setup'
import { shortTime } from '../lib/time'

const MATCH_WORD: Record<string, string> = {
  exact: 'exact name',
  'starts-with': 'starts the same',
  contains: 'contains it',
  'word-starts': 'word starts the same',
  spelling: 'close spelling',
  'sounds-like': 'sounds alike',
}

interface Props {
  project?: Project
  template?: Template
  me: string
  onClose: () => void
}

export function FormDialog({ project, template, me, onClose }: Props) {
  const provisional = useLiveQuery(() => db.provisionalTaxa.toArray(), [], [])
  const taxonDecisions = useLiveQuery(() => db.taxonDecisions.toArray(), [], [])
  const changeRequests = useLiveQuery(() => db.changeRequests.toArray(), [], [])
  const crDecisions = useLiveQuery(() => db.changeRequestDecisions.toArray(), [], [])
  const draft = useLiveQuery(() => loadDraft(), [], undefined)
  const pack = useLiveQuery(() => db.setup.get('speciesPack'), [], undefined)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')
  const [changing, setChanging] = useState<string>()

  const act = async (fn: () => Promise<unknown>, ok?: string) => {
    setError('')
    setDone('')
    try {
      await fn()
      if (ok) setDone(ok)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])

  const taxonName = (id?: string) => (pack?.value as { taxa: { taxonId: string; scientificName: string }[] } | undefined)?.taxa.find((t) => t.taxonId === id)?.scientificName ?? id

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-wide" role="dialog" aria-modal="true" aria-label="Form and requests" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2>Form &amp; requests</h2>
          <button className="btn btn-quiet" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>
        {error && <p className="error">{error}</p>}
        {done && <p className="ok">✓ {done}</p>}

        <div className="panel">
          <h3>Species added in the field</h3>
          {provisional.length === 0 && <p className="muted">None yet.</p>}
          {provisional.map((p) => {
            const decision = taxonDecisions.find((t) => t.provisionalTaxonId === p.provisionalTaxonId)
            return (
              <div key={p.provisionalTaxonId} className="correction">
                <p>
                  <b>{p.data.proposedName}</b> {p.data.rank ? <span className="muted">({p.data.rank})</span> : null} · {teamName(project, p.teamId)} ·{' '}
                  {personName(project, p.data.createdBy)}, {shortTime(p.data.createdAt)}
                </p>
                {p.data.notes && <p className="muted small">"{p.data.notes}"</p>}
                {decision && changing !== p.provisionalTaxonId ? (
                  <p>
                    {decision.decision === 'mapped' ? `✓ Mapped to ${taxonName(decision.taxonId)}` : decision.decision === 'approved' ? '✓ Approved as a new name' : '✕ Rejected'} by{' '}
                    {personName(project, decision.by)}, {shortTime(decision.at)}. Goes to the team in the next HQ bundle.{' '}
                    <button className="link small" onClick={() => setChanging(p.provisionalTaxonId)}>
                      Change
                    </button>
                  </p>
                ) : (
                  <ProvisionalChoices
                    name={p.data.proposedName}
                    onMap={(m) => (setChanging(undefined), act(() => decideProvisional({ provisionalTaxonId: p.provisionalTaxonId, decision: 'mapped', taxonId: m.taxon.taxonId, by: me }), `Mapped to ${m.taxon.scientificName}`))}
                    onApprove={() => (setChanging(undefined), act(() => decideProvisional({ provisionalTaxonId: p.provisionalTaxonId, decision: 'approved', by: me }), 'Approved as a new name'))}
                    onReject={() => (setChanging(undefined), act(() => decideProvisional({ provisionalTaxonId: p.provisionalTaxonId, decision: 'rejected', by: me }), 'Rejected'))}
                  />
                )}
              </div>
            )
          })}
        </div>

        <div className="panel">
          <h3>Form requests from teams</h3>
          {changeRequests.length === 0 && <p className="muted">None yet.</p>}
          {changeRequests.map((c) => {
            const decision = crDecisions.find((x) => x.changeRequestId === c.changeRequestId)
            const inDraft = draft?.acceptedRequestIds.includes(c.changeRequestId)
            return (
              <div key={c.changeRequestId} className="correction">
                <p>
                  <b>{c.data.proposal}</b> · {teamName(project, c.teamId)} · {personName(project, c.data.createdBy)}, {shortTime(c.data.createdAt)}
                </p>
                {c.data.reason && <p className="muted small">Why: {c.data.reason}</p>}
                {decision ? (
                  <p>{decision.decision === 'accepted' ? `✓ In core v${decision.inCoreVersion}` : `✕ Declined${decision.note ? `: "${decision.note}"` : ''}`}</p>
                ) : inDraft ? (
                  <p>✓ Accepted into the draft. It reaches the teams when you publish.</p>
                ) : (
                  <div className="detail-actions">
                    <button className="btn btn-approve" onClick={() => act(() => acceptChangeRequest(c.changeRequestId), 'Added to the draft form')}>
                      Accept into the next form
                    </button>
                    <button
                      className="btn"
                      onClick={() => {
                        const note = window.prompt('Decline this request? Say why (the team sees it):', '')
                        if (note !== null) void act(() => declineChangeRequest(c.changeRequestId, me, note || undefined), 'Declined')
                      }}
                    >
                      Decline
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <FormFields template={template} draft={draft} act={act} me={me} />
      </div>
    </div>
  )
}

function ProvisionalChoices({ name, onMap, onApprove, onReject }: { name: string; onMap: (m: TaxonMatch) => void; onApprove: () => void; onReject: () => void }) {
  const matches = useLiveQuery(() => provisionalSuggestions(name), [name], [])
  return (
    <div className="detail-actions">
      {matches.map((m) => (
        <button key={m.taxon.taxonId} className="btn" onClick={() => onMap(m)} title={`Matched on ${m.matched}`}>
          Did you mean <i>{m.taxon.scientificName}</i>? <span className="muted small">({MATCH_WORD[m.reason] ?? m.reason})</span> → map to this
        </button>
      ))}
      {matches.length === 0 && <span className="muted small">No close name in the species pack.</span>}
      <button className="btn" onClick={onApprove}>
        Keep as a new name
      </button>
      <button className="btn btn-quiet" onClick={onReject}>
        Reject
      </button>
    </div>
  )
}

function FormFields({ template, draft, act, me }: { template?: Template; draft?: TemplateDraft; act: (fn: () => Promise<unknown>, ok?: string) => Promise<void>; me: string }) {
  const [recordType, setRecordType] = useState<'encounter' | 'survey'>('encounter')
  const [nf, setNf] = useState<NewField>({ recordType: 'encounter', label: '', type: 'number', tier: 'core' })
  const [choices, setChoices] = useState('')
  if (!template) return null
  const fields: FieldDef[] = (draft?.baseVersion === template.coreVersion ? draft.fields : template.fields).filter((f) => f.recordType === recordType)
  const next = template.coreVersion + 1
  return (
    <div className="panel">
      <h3>
        The form: core v{template.coreVersion}
        {draft?.changes.length ? ` → draft v${next}` : ''}
      </h3>
      <p className="muted small">Fields are never renamed, retyped or removed: hide one and add a new one. Old records keep showing with the form they were made with.</p>
      {draft && draft.changes.length > 0 && (
        <div className="panel-edited">
          <p>
            <b>Changes waiting to publish as core v{next}:</b>
          </p>
          <ul className="plain small">
            {draft.changes.map((c, i) => (
              <li key={i}>• {c}</li>
            ))}
          </ul>
          <div className="detail-actions">
            <button className="btn btn-approve" onClick={() => act(() => publishDraft(me), `Published core v${next}. Make an HQ bundle to send it to the phones.`)}>
              Publish core v{next}
            </button>
            <button className="btn btn-quiet" onClick={() => act(() => discardDraft(), 'Draft discarded')}>
              Discard draft
            </button>
          </div>
        </div>
      )}
      <div className="row">
        <label className="inline">
          <input type="radio" checked={recordType === 'encounter'} onChange={() => setRecordType('encounter')} /> Animal fields
        </label>
        <label className="inline">
          <input type="radio" checked={recordType === 'survey'} onChange={() => setRecordType('survey')} /> Survey fields
        </label>
      </div>
      <table className="table">
        <thead>
          <tr>
            <th>Field</th>
            <th>Key</th>
            <th>Tier</th>
            <th>Team Lead may</th>
            <th>Added</th>
            <th>Shown</th>
          </tr>
        </thead>
        <tbody>
          {fields.map((f) => (
            <tr key={f.key}>
              <td>
                {f.label}
                {f.unit ? <span className="muted"> ({f.unit})</span> : null}
              </td>
              <td>
                <code>{f.key}</code>
              </td>
              <td>{f.tier === 'core' ? '🔒 core' : f.tier === 'team' ? '🔧 team' : '✏️ free'}</td>
              <td className="small">{f.teamCan?.join(', ') || '—'}</td>
              <td className="small">v{f.addedInCore}</td>
              <td>
                <label className="inline">
                  <input type="checkbox" checked={!f.hidden} onChange={() => act(() => toggleHidden(f.key))} /> {f.hidden ? 'hidden' : 'shown'}
                </label>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <form
        className="correction-form"
        onSubmit={(e) => {
          e.preventDefault()
          void act(
            () => addField({ ...nf, recordType, choices: choices.split(',').map((c) => c.trim()).filter(Boolean) }),
            `Added "${nf.label}" to the draft`,
          ).then(() => {
            setNf({ ...nf, label: '', key: '' })
            setChoices('')
          })
        }}
      >
        <h4>Add a field to the next form ({recordType === 'encounter' ? 'animal' : 'survey'})</h4>
        <div className="row">
          <label>
            Label
            <input value={nf.label} onChange={(e) => setNf({ ...nf, label: e.target.value })} placeholder="Number of individuals" />
          </label>
          <label>
            Key (never changes)
            <input value={nf.key ?? ''} onChange={(e) => setNf({ ...nf, key: e.target.value })} placeholder={keyFromLabel(nf.label) || 'auto'} />
          </label>
          <label>
            Type
            <select value={nf.type} onChange={(e) => setNf({ ...nf, type: e.target.value as NewField['type'] })}>
              <option value="number">Number</option>
              <option value="text">Text</option>
              <option value="choice">Choice</option>
              <option value="boolean">Yes / no</option>
            </select>
          </label>
          {nf.type === 'number' && (
            <label>
              Unit
              <select value={nf.unit ?? ''} onChange={(e) => setNf({ ...nf, unit: (e.target.value || undefined) as Unit | undefined })}>
                <option value="">none (a count)</option>
                <option value="mm">mm</option>
                <option value="g">g</option>
                <option value="m">m</option>
                <option value="degC">°C</option>
                <option value="pct">%</option>
                <option value="h">h</option>
              </select>
            </label>
          )}
          <label>
            Tier
            <select value={nf.tier} onChange={(e) => setNf({ ...nf, tier: e.target.value as NewField['tier'] })}>
              <option value="core">🔒 core (HQ only)</option>
              <option value="team">🔧 team (Team Lead may hide)</option>
              <option value="free">✏️ free</option>
            </select>
          </label>
        </div>
        {nf.type === 'choice' && (
          <label>
            Choices, separated by commas
            <input value={choices} onChange={(e) => setChoices(e.target.value)} placeholder="under log, on trunk, in water" />
          </label>
        )}
        <button className="btn" type="submit" disabled={!nf.label.trim()}>
          Add to draft
        </button>
      </form>
    </div>
  )
}
