// Phone imports an HQ bundle (SHARED-CONTRACT §7.4). Set-up never touches records; receipts never delete.
// Applying the same bundle twice changes nothing.
import { readBundle, type HqBundleParts, type Manifest, type Project, type Template } from '@sciworks/shared';
import { Directory, File, Paths } from 'expo-file-system';

import { saveBasemaps } from '@/db/basemaps';
import { saveSpeciesPhotos } from '@/db/speciesPhotos';
import { run } from '@/db/db';
import {
  addChangeRequestDecisions,
  addCorrections,
  addReceipts,
  addReviews,
  addTaxonDecisions,
} from '@/db/feedback';
import { setMeta } from '@/db/meta';
import { currentSetup, overlayKey, putSetupIfChanged, putSetupVersion } from '@/db/setup';
import { nowIso } from '@/lib/time';

export interface ReceiveResult {
  ok: boolean;
  /** Plain-words lines for the "what changed" screen. */
  changes: string[];
  warnings: string[];
  error?: string;
  manifest?: Manifest;
}

function keepRawBundle(fileName: string, bytes: Uint8Array): string {
  const dir = new Directory(Paths.document, 'bundles-in');
  dir.create({ intermediates: true, idempotent: true });
  const target = new File(dir, fileName);
  if (!target.exists) {
    const tmp = new File(dir, `${fileName}.tmp`);
    if (tmp.exists) tmp.delete();
    tmp.create();
    tmp.write(bytes);
    tmp.rename(fileName);
  }
  return `bundles-in/${fileName}`;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function receiveHqBundle(bytes: Uint8Array, fileName: string): ReceiveResult {
  const read = readBundle(bytes);
  if (!read.ok) return { ok: false, changes: [], warnings: [], error: read.error };
  const { manifest } = read;
  if (manifest.bundleType !== 'hq') {
    return {
      ok: false,
      changes: [],
      warnings: [],
      error: 'This is a Field bundle (from a phone). Open it in the HQ app on the laptop instead.',
      manifest,
    };
  }

  const existing = currentSetup<Project>('project')?.value;
  if (existing && existing.projectId !== manifest.projectId) {
    return {
      ok: false,
      changes: [],
      warnings: [],
      error: `This bundle is for project "${manifest.projectId}", but this phone is set up for "${existing.projectId}". Nothing was changed.`,
      manifest,
    };
  }

  const hq: HqBundleParts = read.hq ?? {};
  const source = `${fileName} (${manifest.bundleId})`;
  const changes: string[] = [];
  const warnings = read.problems.map((p) => `${p.path}: ${p.message}`);
  const receivedAt = nowIso(hq.project?.timeZone ?? existing?.timeZone);
  const priorTemplate = currentSetup<Template>('template')?.value;

  // Set-up: keep every version.
  if (hq.project && putSetupIfChanged('project', hq.project, source)) {
    changes.push(existing ? 'Project details updated' : `Project set up: ${hq.project.name}`);
  }
  if (hq.template) {
    const isNew = putSetupVersion('template', hq.template.coreVersion, hq.template, source);
    if (isNew && (!priorTemplate || hq.template.coreVersion > priorTemplate.coreVersion)) {
      changes.push(`Form "${hq.template.name}" version ${hq.template.coreVersion} (${plural(hq.template.fields.length, 'field')})`);
    } else if (isNew) {
      changes.push(`Older form version ${hq.template.coreVersion} kept for old records`);
    }
  }
  if (hq.overlay && putSetupVersion(overlayKey(hq.overlay.teamId), hq.overlay.overlayRev, hq.overlay, source)) {
    changes.push(`Team form changes for ${hq.overlay.teamId} (change ${hq.overlay.overlayRev})`);
  }
  if (hq.transects && putSetupIfChanged('transects', hq.transects, source)) {
    changes.push(`${plural(hq.transects.features.length, 'transect')}: ${hq.transects.features.map((f) => f.properties.transectId).join(', ')}`);
  }
  if (hq.speciesPack && putSetupIfChanged('species-pack', hq.speciesPack, source)) {
    changes.push(`Species pack: ${plural(hq.speciesPack.taxa.length, 'species', 'species')} (${hq.speciesPack.disclaimer})`);
  }
  if (hq.attribution !== undefined && putSetupIfChanged('attribution', hq.attribution, source)) {
    changes.push('Credits for the species data updated');
  }
  changes.push(...saveBasemaps(hq.basemaps ?? [], hq.basemapFiles ?? {}, source, manifest.createdAt));
  changes.push(...saveSpeciesPhotos(hq.speciesPhotos ?? [], hq.speciesPhotoFiles ?? {}, source, manifest.createdAt));

  // Feedback.
  const receipts = addReceipts(hq.receipts ?? []);
  if (receipts) {
    changes.push(`HQ confirmed ${plural(receipts, 'record version')}`);
    setMeta('lastConfirmedAt', receivedAt);
  }
  const reviews = addReviews(hq.reviews ?? []);
  if (reviews) changes.push(`${plural(reviews, 'review result')} from HQ`);
  const corrections = addCorrections(hq.corrections ?? [], receivedAt);
  if (corrections) changes.push(`${plural(corrections, 'correction request')} in your inbox`);
  const taxa = addTaxonDecisions(hq.taxonDecisions ?? []);
  if (taxa) changes.push(`${plural(taxa, 'decision')} on species added in the field`);
  const crs = addChangeRequestDecisions(hq.changeRequestDecisions ?? []);
  if (crs) changes.push(`${plural(crs, 'decision')} on form change requests`);

  const path = keepRawBundle(fileName, bytes);
  run(
    'INSERT OR IGNORE INTO bundles_in (bundle_id, received_at, file_name, path, manifest_json, summary_json) VALUES (?, ?, ?, ?, ?, ?)',
    [manifest.bundleId, receivedAt, fileName, path, JSON.stringify(manifest), JSON.stringify({ changes, warnings })],
  );

  if (changes.length === 0) changes.push('Nothing new: this phone already had everything in this bundle');
  return { ok: true, changes, warnings, manifest };
}
