// "Did you mean?" for a species added in the field (wireframe H4b): up to 3 numbered matches from the species pack,
// each with Map to this; or Keep as provisional; or Reject. The Data Manager decides; records keep what was typed.

import { useLiveQuery } from 'dexie-react-hooks'
import type { ProvisionalTaxon } from '@sciworks/shared'
import { decideProvisional, provisionalSuggestions } from '../lib/formAdmin'
import { CharDiff } from './DidYouMean'
import { Icon } from './Icons'

const WHY: Record<string, string> = {
  exact: 'Same name',
  'starts-with': 'Starts the same',
  contains: 'Contains it',
  'word-starts': 'A word starts the same',
  spelling: 'Close match',
  'sounds-like': 'Sounds alike',
}

export function ProvisionalCard({ p, me, onDone }: { p: ProvisionalTaxon; me: string; onDone?: (msg: string) => void }) {
  const matches = useLiveQuery(() => provisionalSuggestions(p.proposedName), [p.proposedName], [])
  const decide = async (decision: 'mapped' | 'approved' | 'rejected', taxonId?: string, name?: string) => {
    await decideProvisional({ provisionalTaxonId: p.provisionalTaxonId, decision, taxonId, by: me })
    onDone?.(decision === 'mapped' ? `Mapped to ${name}` : decision === 'approved' ? 'Kept as provisional' : 'Rejected')
  }
  // Mark the letters that differ in the genus ("Leptod[e]ira"), case-insensitively; the epithet stays as published.
  const typedGenus = (p.proposedName.trim().split(/\s+/)[0] ?? '').replace(/^./, (c) => c.toUpperCase())
  return (
    <section className="fk-group fk-dym fk-dym--hq" aria-label="Did you mean? Species pack">
      <div className="fk-dym__head">
        <h3 className="fk-dym__title">Did you mean?</h3>
        <span className="fk-src">
          <Icon name="snake" />
          Species pack
        </span>
      </div>
      <p className="fk-dym__what">
        "{p.proposedName}" was added in the field{p.notes ? `: ${p.notes}` : '.'}
      </p>
      {matches.length > 0 ? (
        <div className="fk-card fk-dym__opts">
          {matches.map((m, i) => {
            const genus = m.taxon.scientificName.split(' ')[0] ?? ''
            const d = CharDiff({ from: typedGenus, to: genus })
            const close = m.reason === 'spelling' || m.reason === 'sounds-like'
            return (
              <div key={m.taxon.taxonId} className="fk-dym__opt">
                <span className="fk-dym__n">{i + 1}</span>
                <div className="fk-dym__change">
                  <span className="fk-dym__old">"{p.proposedName}"</span>
                  <Icon name="arrow" />
                  <span className="fk-dym__new fk-sp" style={{ fontSize: 20 }}>
                    {close ? d.new : genus}
                    {m.taxon.scientificName.slice(genus.length)}
                  </span>
                </div>
                <div className="fk-dym__opt-foot">
                  <span className="fk-dym__opt-eff">
                    <Icon name={close ? 'spell' : 'search'} />
                    {WHY[m.reason] ?? m.reason}
                    {m.taxon.family ? ` · ${m.taxon.family}` : ''}
                  </span>
                  <button className={`fk-btn fk-btn--36 ${i === 0 ? 'fk-btn--primary' : 'fk-btn--grey'}`} onClick={() => decide('mapped', m.taxon.taxonId, m.taxon.scientificName)}>
                    Map to this
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <p className="fk-dym__what" style={{ paddingTop: 8 }}>
          No close name in the species pack.
        </p>
      )}
      <div className="fk-dym__actions">
        <button className="fk-btn fk-btn--secondary" onClick={() => decide('approved')}>
          Keep as provisional
        </button>
        <button className="fk-btn fk-btn--secondary" onClick={() => decide('rejected')}>
          Reject
        </button>
      </div>
      <p className="fk-dym__fine">The team gets the decision in its next bundle. Records keep what was typed; the export uses the mapped name.</p>
    </section>
  )
}
