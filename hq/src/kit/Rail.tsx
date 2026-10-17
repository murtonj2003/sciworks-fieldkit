// A side panel folded to a slim rail (Jack's pick, Sat 17:40: option A). It keeps the panel's counts in view and
// opens again from its arrow, from anywhere on the rail, or with [ (queue) and ] (record).

import type { ReactNode } from 'react'
import { Icon } from './Icons'

export function Rail({
  side,
  label,
  species,
  sub,
  keyHint,
  onOpen,
  children,
}: {
  side: 'left' | 'right'
  label: string
  species?: boolean
  /** A plain-words second part of the label, e.g. the record's status. */
  sub?: string
  keyHint: string
  onOpen: () => void
  children?: ReactNode
}) {
  return (
    <section className={`fk-col hq-rail hq-rail--${side}`} aria-label={`${label}, folded`}>
      <div className="fk-col-h hq-rail__h">
        <FoldButton side={side} folded label={`Open ${side === 'left' ? 'the QA queue' : 'the record'}`} keyHint={keyHint} onClick={onOpen} />
      </div>
      <button className="hq-rail__body" onClick={onOpen} tabIndex={-1} aria-hidden="true">
        {children}
        <span className="hq-rail__lbl">
          <span className={species ? 'fk-sp' : undefined}>{label}</span>
          {sub && <span className="hq-rail__sub"> · {sub}</span>}
        </span>
      </button>
    </section>
  )
}

/** The small arrow in a panel's header that folds it to a rail, or opens it again. Points the way the panel moves. */
export function FoldButton({ side, folded, label, keyHint, onClick }: { side: 'left' | 'right'; folded?: boolean; label: string; keyHint: string; onClick: () => void }) {
  // Left panel: < folds it away, > opens it. Right panel: the reverse.
  const pointsLeft = side === 'left' ? !folded : !!folded
  return (
    <button
      className={`fk-btn fk-btn--grey fk-btn--36 fk-btn--icon hq-fold hq-tip hq-tip--${side === 'left' ? 'start' : 'end'}`}
      onClick={onClick}
      aria-label={`${label} (${keyHint})`}
      data-tip={`${label} · ${keyHint}`}
    >
      <Icon name="chev" className={pointsLeft ? 'hq-flip' : undefined} />
    </button>
  )
}
