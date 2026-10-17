// Phone makes a Field bundle (SHARED-CONTRACT §7.1). Seal every draft → build parts → writeBundle() →
// temp file → rename → only then record it as made. Making a bundle never deletes, locks or hides anything.
import {
  bundleFileName,
  writeBundle,
  type ChangeRequest,
  type Encounter,
  type Overlay,
  type Photo,
  type ProvisionalTaxon,
  type Survey,
} from '@sciworks/shared';
import Constants from 'expo-constants';
import { Directory, File, Paths } from 'expo-file-system';

import { all, run } from '@/db/db';
import { listCorrectionResponses, receiptRev } from '@/db/feedback';
import { newId, setMeta } from '@/db/meta';
import { listPhotos, photoBytes } from '@/db/photos';
import { sealAll } from '@/db/records';
import { nowIso } from '@/lib/time';
import type { LocalEncounter, LocalRecord, LocalSurvey } from '@/model/records';
import type { FieldState } from '@/state/field';

export type Scope = 'unconfirmed' | 'full';

export interface BundlePlan {
  surveys: LocalSurvey[];
  encounters: LocalEncounter[];
  photos: (Photo & { path: string })[];
  provisionalTaxa: ProvisionalTaxon[];
  changeRequests: ChangeRequest[];
  correctionResponses: number;
}

function latestRevs(): LocalRecord[] {
  return all<{ json: string }>(
    `SELECT r.json FROM record_revs r
       JOIN (SELECT id, MAX(rev) AS rev FROM record_revs GROUP BY id) m ON r.id = m.id AND r.rev = m.rev`,
  ).map((r) => JSON.parse(r.json) as LocalRecord);
}

/** What a bundle of this scope would carry right now (seals drafts first). */
export function planBundle(scope: Scope): BundlePlan {
  sealAll();
  const records = latestRevs().filter((r) => scope === 'full' || receiptRev(r.id) < r.rev);
  const surveys = records.filter((r): r is LocalSurvey => r.recordType === 'survey');
  const encounters = records.filter((r): r is LocalEncounter => r.recordType === 'encounter');
  const wanted = new Set(encounters.flatMap((e) => e.photoIds));
  const photos = listPhotos().filter((p) => scope === 'full' || wanted.has(p.photoId));
  return {
    surveys,
    encounters,
    photos,
    provisionalTaxa: all<{ json: string }>('SELECT json FROM provisional_taxa').map((r) => JSON.parse(r.json)),
    changeRequests: all<{ json: string }>('SELECT json FROM change_requests').map((r) => JSON.parse(r.json)),
    correctionResponses: listCorrectionResponses().length,
  };
}

function outDir(): Directory {
  const dir = new Directory(Paths.document, 'bundles-out');
  dir.create({ intermediates: true, idempotent: true });
  return dir;
}

export interface MadeBundle {
  fileName: string;
  uri: string;
  bytes: number;
  counts: { surveys: number; encounters: number; photos: number; problems: string[] };
}

export async function makeFieldBundle(field: FieldState, scope: Scope): Promise<MadeBundle> {
  const { project, template, person, overlay } = field;
  if (!project || !template || !person) throw new Error('Load a project and choose a person first.');
  const plan = planBundle(scope);

  // Photo bytes. A missing file is reported, never silently dropped: its Photo entry still goes, so HQ
  // can see it is missing.
  const photoFiles: Record<string, Uint8Array> = {};
  const problems: string[] = [];
  for (const p of plan.photos) {
    try {
      photoFiles[p.photoId] = await photoBytes(p.path);
    } catch {
      problems.push(`Photo ${p.photoId} could not be read from the phone`);
    }
  }

  const createdAt = nowIso(project.timeZone);
  const header = {
    bundleType: 'field' as const,
    bundleId: newId(),
    createdAt,
    createdBy: {
      app: 'field' as const,
      appVersion: Constants.expoConfig?.version ?? '0.0.0',
      deviceId: field.deviceId,
      personId: person.personId,
    },
    projectId: project.projectId,
    teamId: person.teamId,
    coreVersion: template.coreVersion,
    overlayRev: overlay?.overlayRev ?? 0,
    scope,
  };
  const zip = writeBundle({
    ...header,
    parts: {
      surveys: plan.surveys as unknown as Survey[],
      encounters: plan.encounters as unknown as Encounter[],
      photos: plan.photos.map(({ path: _path, ...photo }) => photo),
      photoFiles,
      ...(overlay && overlay.teamId === person.teamId ? { overlay: overlay as Overlay } : {}),
      provisionalTaxa: plan.provisionalTaxa,
      changeRequests: plan.changeRequests,
      correctionResponses: listCorrectionResponses(),
    },
  });

  const baseName = bundleFileName(header);
  const dir = outDir();
  for (const item of dir.list()) {
    if (item instanceof File && item.name.endsWith('.tmp')) item.delete(); // a half-file from a crash: never shared
  }
  // Never overwrite an earlier bundle file (two in the same minute get -2, -3…).
  let fileName = baseName;
  for (let i = 2; new File(dir, fileName).exists; i++) fileName = baseName.replace(/\.zip$/, `-${i}.zip`);
  const tmp = new File(dir, `${fileName}.tmp`);
  tmp.create({ overwrite: true });
  tmp.write(zip);
  tmp.rename(fileName);

  const counts = { surveys: plan.surveys.length, encounters: plan.encounters.length, photos: plan.photos.length, problems };
  run('INSERT INTO bundles_out (bundle_id, created_at, file_name, scope, counts_json) VALUES (?, ?, ?, ?, ?)', [
    header.bundleId,
    createdAt,
    fileName,
    scope,
    JSON.stringify(counts),
  ]);
  setMeta('lastHandoverAt', createdAt);
  return { fileName, uri: new File(dir, fileName).uri, bytes: zip.length, counts };
}

export function listBundlesOut(): { fileName: string; createdAt: string; scope: Scope; counts: MadeBundle['counts'] }[] {
  return all<{ file_name: string; created_at: string; scope: Scope; counts_json: string }>(
    'SELECT * FROM bundles_out ORDER BY rowid DESC',
  ).map((r) => ({ fileName: r.file_name, createdAt: r.created_at, scope: r.scope, counts: JSON.parse(r.counts_json) }));
}

export function listBundlesIn(): { fileName: string; receivedAt: string; changes: string[] }[] {
  return all<{ file_name: string; received_at: string; summary_json: string }>('SELECT * FROM bundles_in ORDER BY rowid DESC').map(
    (r) => ({ fileName: r.file_name, receivedAt: r.received_at, changes: JSON.parse(r.summary_json).changes ?? [] }),
  );
}
