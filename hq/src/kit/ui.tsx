// Small shared pieces on the kit's classes: status chip, band text, tags, dialog shell.

import { useEffect, type ReactNode } from 'react'
import type { ReviewStatus } from '@sciworks/shared'
import { BAND_MARK, BAND_WORD, STATUS_ICON, STATUS_WORD } from '../lib/format'
import { Icon, Mark, type IconName } from './Icons'

export type Band = keyof typeof BAND_WORD

/** Pill, icon + word: Received · Flagged · Edited · Approved · Rejected (handoff §1.4). */
export function StatusChip({ status }: { status: ReviewStatus }) {
  return (
    <span className={`fk-status fk-status--${status}`}>
      <Icon name={STATUS_ICON[status]} />
      {STATUS_WORD[status]}
    </span>
  )
}

/** A band at text size: the marker's shape plus the word, never colour alone. */
export function BandText({ band, size = 16 }: { band: Band; size?: 14 | 16 }) {
  return (
    <span className="fk-bandtext">
      <Mark band={BAND_MARK[band]} size={size} />
      {BAND_WORD[band]}
    </span>
  )
}

export function Tag({ icon, children, kind }: { icon?: IconName; children: ReactNode; kind?: 'draft' | 'venom' | 'incomplete' }) {
  return (
    <span className={`fk-tag${kind ? ` fk-tag--${kind}` : ''}`}>
      {icon && <Icon name={icon} />}
      {children}
    </span>
  )
}

/** The AI's tags: always "AI reviewer" + "Draft" while waiting (an outlined neutral tag, never violet). */
export function AiTags({ draft = true }: { draft?: boolean }) {
  return (
    <span className="fk-srcs">
      <span className="fk-src">
        <Icon name="reviewer" />
        AI reviewer
      </span>
      {draft && <span className="fk-tag fk-tag--draft">Draft</span>}
    </span>
  )
}

/** The kit's dialog over a dimmed screen. Escape or the scrim closes it. */
export function Dialog({ title, onClose, children, foot, wide }: { title: string; onClose: () => void; children: ReactNode; foot?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div className="fk-scrim hq-scrim" onClick={onClose}>
      <div className={`fk-dialog hq-dlg${wide ? ' hq-dlg--wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="fk-dialog__head">
          <h2>{title}</h2>
          <button className="fk-icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="cross" />
          </button>
        </div>
        <div className="fk-dialog__body">{children}</div>
        {foot && <div className="fk-dialog__foot">{foot}</div>}
      </div>
    </div>
  )
}

/** Sets the species name in italic wherever it appears inside a sentence (Italic Species rule). */
export function WithSpecies({ text, names }: { text: string; names: (string | undefined)[] }) {
  const list = names.filter((n): n is string => !!n && n.length > 3)
  if (!list.length) return <>{text}</>
  const re = new RegExp(`(${list.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`)
  return (
    <>
      {text.split(re).map((part, i) => (list.includes(part) ? <i key={i} className="fk-sp">{part}</i> : part))}
    </>
  )
}
