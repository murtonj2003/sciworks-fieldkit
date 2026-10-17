// Files out of HQ: a plain download the Data Manager AirDrops or copies to USB. And the HQ backup.

import { strToU8, zipSync } from 'fflate'
import { db, type HqDb } from '../db'
import { nowIso } from './time'

export function download(bytes: Uint8Array, fileName: string, type = 'application/zip') {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/**
 * Every raw bundle (in and out) plus HQ's own decisions, in one zip. Re-importing the field bundles
 * rebuilds every record; hq-state.json holds the reviews, corrections and decisions made at HQ.
 */
export async function makeBackup(d: HqDb = db): Promise<{ bytes: Uint8Array; fileName: string; bundles: number }> {
  const bundles = await d.bundles.toArray()
  const files: Record<string, Uint8Array> = {}
  for (const b of bundles) {
    const folder = b.direction === 'in' ? (b.kind === 'unreadable' ? 'unreadable' : 'received') : 'sent'
    files[`${folder}/${b.sha256.slice(0, 8)}_${b.fileName.replace(/[^\w.\-() ]/g, '_')}`] = b.bytes
  }
  const state = {
    exportedAt: nowIso(),
    reviewLog: await d.reviewLog.toArray(),
    corrections: await d.corrections.toArray(),
    taxonDecisions: await d.taxonDecisions.toArray(),
    changeRequestDecisions: await d.changeRequestDecisions.toArray(),
    templates: await d.templates.toArray(),
    quarantine: await d.quarantine.toArray(),
  }
  files['hq-state.json'] = strToU8(JSON.stringify(state, null, 2))
  const stamp = state.exportedAt.slice(0, 16).replace(/[-:]/g, '').replace('T', '-')
  return { bytes: zipSync(files), fileName: `HQ-backup_${stamp}.zip`, bundles: bundles.length }
}
