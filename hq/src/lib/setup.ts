// HQ's set-up: project, form template (every version kept), transects, species pack and its photos, attribution,
// satellite pictures.

import { sha256Hex, type Basemap, type HqBundleParts, type Project, type SpeciesPack, type Template, type TransectCollection } from '@sciworks/shared'
import { db, type HqDb } from '../db'
import { nowIso, setSiteTimeZone } from './time'

export interface Setup {
  project?: Project
  template?: Template
  templates: Template[]
  transects?: TransectCollection
  speciesPack?: SpeciesPack
  attribution?: string
}

export async function loadSetup(d: HqDb = db): Promise<Setup> {
  const [project, transects, speciesPack, attribution, templateRows] = await Promise.all([
    d.setup.get('project'),
    d.setup.get('transects'),
    d.setup.get('speciesPack'),
    d.setup.get('attribution'),
    d.templates.orderBy('coreVersion').toArray(),
  ])
  const templates = templateRows.map((t) => t.data)
  const p = project?.value as Project | undefined
  if (p?.timeZone) setSiteTimeZone(p.timeZone)
  return {
    project: p,
    transects: transects?.value as TransectCollection | undefined,
    speciesPack: speciesPack?.value as SpeciesPack | undefined,
    attribution: attribution?.value as string | undefined,
    templates,
    template: templates[templates.length - 1],
  }
}

/**
 * Applies the set-up part of an HQ bundle (the demo project ships as one). Set-up never touches records.
 * A template is adopted only if its core version is new; every version is kept.
 */
export async function applySetup(parts: HqBundleParts, d: HqDb = db): Promise<string[]> {
  const applied: string[] = []
  const now = nowIso()
  if (parts.project) {
    await d.setup.put({ key: 'project', value: parts.project })
    setSiteTimeZone(parts.project.timeZone)
    applied.push(`project ${parts.project.projectId}`)
  }
  if (parts.transects) {
    await d.setup.put({ key: 'transects', value: parts.transects })
    applied.push(`${parts.transects.features.length} transects`)
  }
  if (parts.speciesPack) {
    await d.setup.put({ key: 'speciesPack', value: parts.speciesPack })
    applied.push(`species pack (${parts.speciesPack.taxa.length} taxa)`)
  }
  if (parts.attribution !== undefined) {
    await d.setup.put({ key: 'attribution', value: parts.attribution })
    applied.push('attribution')
  }
  // Satellite pictures: only ones whose bytes arrived and passed the checksum. Same picture again = no change.
  let pictures = 0
  for (const meta of parts.basemaps ?? []) {
    const bytes = parts.basemapFiles?.[meta.basemapId]
    if (!bytes || sha256Hex(bytes) !== meta.sha256) continue
    const had = await d.basemaps.get(meta.basemapId)
    if (had?.meta.sha256 === meta.sha256) continue
    await d.basemaps.put({ basemapId: meta.basemapId, meta, bytes, receivedAt: now })
    pictures++
  }
  if (pictures) applied.push(`${pictures} satellite picture${pictures === 1 ? '' : 's'}`)
  // Species photos, the same way: checksum-checked bytes only, and the same photo again changes nothing.
  let photos = 0
  for (const meta of parts.speciesPhotos ?? []) {
    const bytes = parts.speciesPhotoFiles?.[meta.taxonId]
    if (!bytes || sha256Hex(bytes) !== meta.sha256) continue
    const had = await d.speciesPhotos.get(meta.taxonId)
    if (had?.meta.sha256 === meta.sha256) continue
    await d.speciesPhotos.put({ taxonId: meta.taxonId, meta, bytes, receivedAt: now })
    photos++
  }
  if (photos) applied.push(`${photos} species photo${photos === 1 ? '' : 's'}`)
  if (parts.template) {
    const existing = await d.templates.get(parts.template.coreVersion)
    if (!existing) {
      await d.templates.put({ coreVersion: parts.template.coreVersion, data: parts.template, publishedAt: parts.template.publishedAt ?? now })
      applied.push(`form core v${parts.template.coreVersion}`)
    }
  }
  return applied
}

/** The satellite pictures that cover any of these transects: listed for one of them, or holding one of their points. */
export function basemapsFor(basemaps: Basemap[], transects: TransectCollection | undefined): Basemap[] {
  const feats = transects?.features ?? []
  return basemaps.filter(
    (b) =>
      b.transectIds?.some((id) => feats.some((f) => f.properties.transectId === id)) ||
      feats.some((f) =>
        f.geometry.coordinates.some(([lon, lat]) => lon! >= b.bounds.lonMin && lon! <= b.bounds.lonMax && lat! >= b.bounds.latMin && lat! <= b.bounds.latMax),
      ),
  )
}

export function transectById(setup: Pick<Setup, 'transects'>, transectId: string) {
  return setup.transects?.features.find((f) => f.properties.transectId === transectId)
}

export function personName(project: Project | undefined, personId?: string): string {
  if (!personId) return ''
  return project?.people.find((p) => p.personId === personId)?.name ?? personId
}

export function teamName(project: Project | undefined, teamId?: string): string {
  if (!teamId) return ''
  return project?.teams.find((t) => t.teamId === teamId)?.name ?? teamId
}

/** The person using HQ. The demo project has one Data Manager. */
export function dataManagerOf(project: Project | undefined): { personId: string; name: string } {
  const dm = project?.people.find((p) => p.role === 'data-manager')
  return dm ? { personId: dm.personId, name: dm.name } : { personId: 'hq', name: 'Data Manager' }
}
