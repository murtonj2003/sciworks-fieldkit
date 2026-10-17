// Every flag in plain words, with where it came from. The screen shows a word and an icon, never colour alone.

import type { CoordCheck, CoordFlag, Encounter, Survey } from '@sciworks/shared'
import type { FlagItem, HqCheck } from '../db'

const m = (n: number) => `${Math.round(n).toLocaleString('en-GB')} m`

function coordFlagText(flag: CoordFlag, c: CoordCheck): string | undefined {
  switch (flag) {
    case 'OUTSIDE_PROJECT_BBOX':
      return 'Outside the project area.'
    case 'OFF_TRANSECT_AMBER':
      return `Near the line: ${m(c.offsetM)} from ${c.transectId} (allowed ${m(c.toleranceM)}). Worth a look.`
    case 'OFF_TRANSECT_RED':
      return `Off the line: ${m(c.offsetM)} off ${c.transectId} (allowed ${m(c.toleranceM)}). Likely a typing error.`
    case 'CHAINAGE_MISMATCH':
      return 'Distance along the transect does not match the point.'
    case 'TYPED_DISTANCE_DISAGREES':
      return 'The typed distance along the transect disagrees with the point.'
    case 'ORDER_REVERSED':
      return 'Out of walking order: this animal sits behind the one before it on a one-way walk.'
    case 'PRESUMED_NEGATED_LONGITUDE':
      return 'The longitude may be missing its minus sign.'
    case 'PRESUMED_SWAPPED_COORDINATE':
      return 'Latitude and longitude may be swapped.'
    case 'POSSIBLE_DATUM_SHIFT':
      return 'Every point on this walk is shifted the same way. Check the GPS datum setting.'
    case 'ROBUST_OUTLIER':
      return 'Much further from the line than the rest of this walk.'
  }
}

/** Builds the flag list for one record's current rev from the phone's check, HQ's checks and the batch check. */
export function flagsFor(data: Survey | Encounter, hq: HqCheck | undefined, extra: { provisionalPending?: boolean } = {}): FlagItem[] {
  const out: FlagItem[] = []
  if (data.status === 'void') out.push({ code: 'VOID', source: 'phone', level: 'info', text: 'Voided on the phone. Kept, never exported.' })

  if (data.recordType === 'survey') {
    if (!data.finishedAt) out.push({ code: 'UNFINISHED', source: 'phone', level: 'info', text: 'Survey not finished on the phone yet. Still data.' })
    for (const w of data.protocolWarnings ?? []) {
      out.push({ code: `PROTOCOL_${w.code}`, source: 'phone', level: 'warn', text: `Protocol warning acknowledged in the field: ${w.message}` })
    }
    return out
  }

  const e = data
  const phone = e.location.check
  const decision = phone.decision
  if (decision?.kind === 'accepted-suggestion') {
    const s = phone.suggestions.find((x) => x.kind === decision.suggestionKind) ?? phone.suggestions[0]
    out.push({
      code: 'FIXED_IN_FIELD',
      source: 'phone',
      level: 'info',
      text: `Coordinate fixed in the field: ${s?.explain ?? 'a "did you mean?" suggestion was accepted.'}`,
    })
  } else if ((phone.band === 'red' || phone.band === 'amber' || phone.band === 'outside-bbox') && decision) {
    const why = decision.kind === 'override' && decision.reason ? ` Reason given: "${decision.reason}"` : ''
    out.push({
      code: `PHONE_${decision.kind.toUpperCase()}`,
      source: 'phone',
      level: 'warn',
      text: `The surveyor kept a point ${m(phone.offsetM)} from the line (${decision.kind.replace('-', ' ')}).${why}`,
    })
  }

  if (hq?.transectMissing) {
    out.push({ code: 'TRANSECT_UNKNOWN', source: 'setup', level: 'warn', text: `Transect ${e.transectId} is not in HQ's set-up, so the point can't be checked.` })
  }
  if (hq?.coord) {
    for (const f of hq.coord.flags) {
      const text = coordFlagText(f, hq.coord)
      if (text) out.push({ code: f, source: 'hq', level: 'warn', text })
    }
  }
  for (const f of hq?.batchFlags ?? []) {
    const text = hq?.coord ? coordFlagText(f, hq.coord) : undefined
    out.push({ code: f, source: 'batch', level: 'warn', text: text ?? f })
  }
  for (const r of hq?.ranges ?? []) {
    out.push({ code: `RANGE_${r.fieldPath.toUpperCase()}`, source: 'range', level: 'warn', text: r.message })
  }

  if (e.taxon.provisionalTaxonId && extra.provisionalPending !== false) {
    out.push({ code: 'PROVISIONAL_TAXON', source: 'phone', level: 'info', text: 'Uses a species added in the field. Waiting for HQ to approve or map it.' })
  }
  if (e.taxon.unidentified) out.push({ code: 'UNIDENTIFIED', source: 'phone', level: 'info', text: 'Unidentified: ID to follow from photos.' })
  return out
}

export const hasWarning = (flags: FlagItem[]) => flags.some((f) => f.level === 'warn')
