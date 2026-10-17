// Bundle files: the only way the Field app and the HQ app exchange data (SHARED-CONTRACT §3, §7).
// Bytes in, bytes out. No file-system or browser APIs, so the phone and the browser run identical code.

import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import type { z } from 'zod';
import {
  basemapSchema,
  speciesPhotoSchema,
  changeRequestDecisionSchema,
  changeRequestSchema,
  correctionRequestSchema,
  correctionResponseSchema,
  encounterSchema,
  manifestSchema,
  overlaySchema,
  photoSchema,
  projectSchema,
  provisionalTaxonSchema,
  receiptSchema,
  reviewSchema,
  speciesPackSchema,
  surveySchema,
  taxonDecisionSchema,
  templateSchema,
  transectCollectionSchema,
} from './schemas';
import {
  CONTRACT_VERSION,
  type Basemap,
  type SpeciesPhoto,
  type ChangeRequest,
  type ChangeRequestDecision,
  type Code,
  type CorrectionRequest,
  type CorrectionResponse,
  type Encounter,
  type FieldBundleParts,
  type HqBundleParts,
  type IsoTime,
  type Manifest,
  type ManifestEntry,
  type Overlay,
  type Photo,
  type Project,
  type ProvisionalTaxon,
  type Receipt,
  type Review,
  type SpeciesPack,
  type Survey,
  type TaxonDecision,
  type Template,
  type TransectCollection,
  type Uuid,
} from './types';

export const FIELD_PATHS = {
  surveys: 'records/surveys.json',
  encounters: 'records/encounters.json',
  photos: 'photos/index.json',
  overlay: 'team/overlay.json',
  provisionalTaxa: 'team/provisional-taxa.json',
  changeRequests: 'team/change-requests.json',
  correctionResponses: 'team/correction-responses.json',
} as const;

export const HQ_PATHS = {
  project: 'setup/project.json',
  template: 'setup/template.json',
  overlay: 'setup/overlay.json',
  transects: 'setup/transects.geojson',
  speciesPack: 'setup/species-pack.json',
  attribution: 'setup/attribution.md',
  /** The pictures themselves sit at each Basemap's `file`, e.g. 'setup/basemaps/<id>.jpg'. */
  basemaps: 'setup/basemaps.json',
  /** Each photo sits at its `file`, e.g. 'setup/species-photos/<taxon>.jpg'. */
  speciesPhotos: 'setup/species-photos.json',
  receipts: 'feedback/receipts.json',
  reviews: 'feedback/reviews.json',
  corrections: 'feedback/corrections.json',
  taxonDecisions: 'feedback/taxon-decisions.json',
  changeRequestDecisions: 'feedback/change-request-decisions.json',
} as const;

const ARRAY_SCHEMAS: Record<string, z.ZodType> = {
  [FIELD_PATHS.surveys]: surveySchema,
  [FIELD_PATHS.encounters]: encounterSchema,
  [FIELD_PATHS.photos]: photoSchema,
  [FIELD_PATHS.provisionalTaxa]: provisionalTaxonSchema,
  [FIELD_PATHS.changeRequests]: changeRequestSchema,
  [FIELD_PATHS.correctionResponses]: correctionResponseSchema,
  [HQ_PATHS.receipts]: receiptSchema,
  [HQ_PATHS.reviews]: reviewSchema,
  [HQ_PATHS.corrections]: correctionRequestSchema,
  [HQ_PATHS.taxonDecisions]: taxonDecisionSchema,
  [HQ_PATHS.changeRequestDecisions]: changeRequestDecisionSchema,
  [HQ_PATHS.basemaps]: basemapSchema,
  [HQ_PATHS.speciesPhotos]: speciesPhotoSchema,
};

const OBJECT_SCHEMAS: Record<string, z.ZodType> = {
  [FIELD_PATHS.overlay]: overlaySchema,
  [HQ_PATHS.overlay]: overlaySchema,
  [HQ_PATHS.project]: projectSchema,
  [HQ_PATHS.template]: templateSchema,
  [HQ_PATHS.transects]: transectCollectionSchema,
  [HQ_PATHS.speciesPack]: speciesPackSchema,
};

export function sha256Hex(bytes: Uint8Array): string {
  return bytesToHex(sha256(bytes));
}

export interface BundleHeader {
  bundleId: Uuid;
  createdAt: IsoTime;
  createdBy: Manifest['createdBy'];
  projectId: Code;
  teamId: Code;
  coreVersion: number;
  overlayRev?: number;
  scope?: 'unconfirmed' | 'full';
}

export type WriteBundleInput =
  | ({ bundleType: 'field'; parts: FieldBundleParts } & BundleHeader)
  | ({ bundleType: 'hq'; parts: HqBundleParts } & BundleHeader);

const json = (value: unknown) => strToU8(JSON.stringify(value, null, 2));

/** Builds a bundle zip. The caller writes it under a temp name, renames it, and only then marks anything exported. */
export function writeBundle(input: WriteBundleInput): Uint8Array {
  const files: Record<string, { bytes: Uint8Array; count?: number }> = {};
  const put = (path: string, value: unknown) => {
    if (value === undefined) return;
    files[path] = { bytes: json(value), count: Array.isArray(value) ? value.length : undefined };
  };

  if (input.bundleType === 'field') {
    const p = input.parts;
    put(FIELD_PATHS.surveys, p.surveys);
    put(FIELD_PATHS.encounters, p.encounters);
    put(FIELD_PATHS.photos, p.photos);
    put(FIELD_PATHS.overlay, p.overlay);
    put(FIELD_PATHS.provisionalTaxa, p.provisionalTaxa);
    put(FIELD_PATHS.changeRequests, p.changeRequests);
    put(FIELD_PATHS.correctionResponses, p.correctionResponses);
    for (const photo of p.photos ?? []) {
      const bytes = p.photoFiles?.[photo.photoId];
      if (bytes) files[photo.file] = { bytes };
    }
  } else {
    const p = input.parts;
    put(HQ_PATHS.project, p.project);
    put(HQ_PATHS.template, p.template);
    put(HQ_PATHS.overlay, p.overlay);
    put(HQ_PATHS.transects, p.transects);
    put(HQ_PATHS.speciesPack, p.speciesPack);
    if (p.attribution !== undefined) files[HQ_PATHS.attribution] = { bytes: strToU8(p.attribution) };
    put(HQ_PATHS.receipts, p.receipts);
    put(HQ_PATHS.reviews, p.reviews);
    put(HQ_PATHS.corrections, p.corrections);
    put(HQ_PATHS.taxonDecisions, p.taxonDecisions);
    put(HQ_PATHS.changeRequestDecisions, p.changeRequestDecisions);
    put(HQ_PATHS.basemaps, p.basemaps);
    for (const b of p.basemaps ?? []) {
      const bytes = p.basemapFiles?.[b.basemapId];
      if (bytes) files[b.file] = { bytes };
    }
    put(HQ_PATHS.speciesPhotos, p.speciesPhotos);
    for (const ph of p.speciesPhotos ?? []) {
      const bytes = p.speciesPhotoFiles?.[ph.taxonId];
      if (bytes) files[ph.file] = { bytes };
    }
  }

  const contents: ManifestEntry[] = Object.entries(files).map(([path, f]) => ({
    path,
    bytes: f.bytes.length,
    sha256: sha256Hex(f.bytes),
    ...(f.count !== undefined ? { count: f.count } : {}),
  }));

  const manifest: Manifest = {
    format: 'sciworks-bundle',
    contractVersion: CONTRACT_VERSION,
    bundleType: input.bundleType,
    bundleId: input.bundleId,
    createdAt: input.createdAt,
    createdBy: input.createdBy,
    projectId: input.projectId,
    teamId: input.teamId,
    coreVersion: input.coreVersion,
    ...(input.overlayRev !== undefined ? { overlayRev: input.overlayRev } : {}),
    ...(input.bundleType === 'field' ? { scope: input.scope ?? 'unconfirmed' } : {}),
    contents,
  };

  // Manifest first. JPEGs are already compressed, so store them as-is. File times = bundle time, so the
  // same input always gives the same zip.
  const mtime = new Date(input.createdAt);
  const zippable: Zippable = { 'manifest.json': [json(manifest), { level: 6, mtime }] };
  for (const [path, f] of Object.entries(files)) {
    zippable[path] = [f.bytes, { level: path.endsWith('.jpg') ? 0 : 6, mtime }];
  }
  return zipSync(zippable);
}

/** 'FIELD_cr-herps_team-b_7f3a_20261017-2130.zip' / 'HQ_cr-herps_team-b_core1_20261017-2130.zip' */
export function bundleFileName(m: Pick<Manifest, 'bundleType' | 'projectId' | 'teamId' | 'coreVersion' | 'createdAt' | 'createdBy'>): string {
  const stamp = m.createdAt.slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
  if (m.bundleType === 'field') {
    const device = (m.createdBy.deviceId ?? 'xxxx').replace(/-/g, '').slice(-4);
    return `FIELD_${m.projectId}_${m.teamId}_${device}_${stamp}.zip`;
  }
  return `HQ_${m.projectId}_${m.teamId}_core${m.coreVersion}_${stamp}.zip`;
}

export interface BundleProblem {
  path: string;
  /** Plain words, safe to show to a person. */
  message: string;
  /** For array files: which item was bad. */
  index?: number;
}

export interface ReadBundleOk {
  ok: true;
  manifest: Manifest;
  field?: FieldBundleParts;
  hq?: HqBundleParts;
  /** Bad files and bad items. The rest of the bundle still imports. */
  problems: BundleProblem[];
  /** Items that failed validation, kept so nothing is ever thrown away (HQ quarantines them). */
  rejected: { path: string; index?: number; value: unknown }[];
  /** Files we don't recognise. Keep them; a newer app may need them. */
  unknownFiles: Record<string, Uint8Array>;
}

export type ReadBundleResult = ReadBundleOk | { ok: false; error: string };

/** Reads a bundle. Rejects only a wrong format or a different major contract version (SHARED-CONTRACT §7.2). */
export function readBundle(bytes: Uint8Array): ReadBundleResult {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    return { ok: false, error: 'This file is not a readable zip.' };
  }
  const manifestBytes = files['manifest.json'];
  if (!manifestBytes) return { ok: false, error: 'This zip has no manifest.json, so it is not a bundle.' };

  let rawManifest: unknown;
  try {
    rawManifest = JSON.parse(strFromU8(manifestBytes));
  } catch {
    return { ok: false, error: 'manifest.json is not valid JSON.' };
  }
  const parsed = manifestSchema.safeParse(rawManifest);
  if (!parsed.success) {
    const format = (rawManifest as { format?: unknown })?.format;
    if (format !== 'sciworks-bundle') return { ok: false, error: 'This is not a sciworks bundle.' };
    return { ok: false, error: `manifest.json is damaged: ${parsed.error.issues[0]?.message ?? 'unknown problem'}` };
  }
  const manifest = parsed.data as unknown as Manifest;
  const major = manifest.contractVersion.split('.')[0];
  if (major !== CONTRACT_VERSION.split('.')[0]) {
    return {
      ok: false,
      error: `This bundle uses contract version ${manifest.contractVersion}; this app reads ${CONTRACT_VERSION}. Update the app.`,
    };
  }

  const problems: BundleProblem[] = [];
  const rejected: ReadBundleOk['rejected'] = [];
  const good: Record<string, Uint8Array> = {};
  const listed = new Set<string>(['manifest.json']);

  for (const entry of manifest.contents) {
    listed.add(entry.path);
    const file = files[entry.path];
    if (!file) {
      problems.push({ path: entry.path, message: 'Listed in the manifest but missing from the zip.' });
      continue;
    }
    if (sha256Hex(file) !== entry.sha256) {
      problems.push({ path: entry.path, message: 'Damaged: its checksum does not match the manifest. Skipped.' });
      continue;
    }
    good[entry.path] = file;
  }

  const unknownFiles: Record<string, Uint8Array> = {};
  for (const [path, file] of Object.entries(files)) {
    if (!listed.has(path)) unknownFiles[path] = file;
  }

  const parseJson = (path: string): unknown => {
    const file = good[path];
    if (!file) return undefined;
    try {
      return JSON.parse(strFromU8(file));
    } catch {
      problems.push({ path, message: 'Not valid JSON. Skipped.' });
      return undefined;
    }
  };

  const readArray = <T>(path: string): T[] | undefined => {
    const value = parseJson(path);
    if (value === undefined) return undefined;
    if (!Array.isArray(value)) {
      problems.push({ path, message: 'Expected a list. Skipped.' });
      rejected.push({ path, value });
      return undefined;
    }
    const schema = ARRAY_SCHEMAS[path];
    const out: T[] = [];
    value.forEach((item, index) => {
      const r = schema ? schema.safeParse(item) : { success: true as const, data: item };
      if (r.success) out.push(r.data as T);
      else {
        const issue = r.error.issues[0];
        problems.push({ path, index, message: `Item ${index + 1} is invalid (${issue?.path.join('.') || 'record'}: ${issue?.message}). Kept aside.` });
        rejected.push({ path, index, value: item });
      }
    });
    return out;
  };

  const readObject = <T>(path: string): T | undefined => {
    const value = parseJson(path);
    if (value === undefined) return undefined;
    const schema = OBJECT_SCHEMAS[path];
    const r = schema ? schema.safeParse(value) : { success: true as const, data: value };
    if (r.success) return r.data as T;
    const issue = r.error.issues[0];
    problems.push({ path, message: `Invalid (${issue?.path.join('.') || 'file'}: ${issue?.message}). Kept aside.` });
    rejected.push({ path, value });
    return undefined;
  };

  if (manifest.bundleType === 'field') {
    const photos = readArray<Photo>(FIELD_PATHS.photos);
    const photoFiles: Record<Uuid, Uint8Array> = {};
    for (const photo of photos ?? []) {
      const file = good[photo.file];
      if (!file) continue; // already reported as missing or damaged
      if (sha256Hex(file) !== photo.sha256) {
        problems.push({ path: photo.file, message: 'Photo bytes do not match the photo index checksum. Skipped.' });
        continue;
      }
      photoFiles[photo.photoId] = file;
    }
    return {
      ok: true,
      manifest,
      field: strip({
        surveys: readArray<Survey>(FIELD_PATHS.surveys),
        encounters: readArray<Encounter>(FIELD_PATHS.encounters),
        photos,
        photoFiles,
        overlay: readObject<Overlay>(FIELD_PATHS.overlay),
        provisionalTaxa: readArray<ProvisionalTaxon>(FIELD_PATHS.provisionalTaxa),
        changeRequests: readArray<ChangeRequest>(FIELD_PATHS.changeRequests),
        correctionResponses: readArray<CorrectionResponse>(FIELD_PATHS.correctionResponses),
      }),
      problems,
      rejected,
      unknownFiles,
    };
  }

  const attributionFile = good[HQ_PATHS.attribution];
  const basemaps = readArray<Basemap>(HQ_PATHS.basemaps);
  const basemapFiles: Record<Code, Uint8Array> = {};
  for (const b of basemaps ?? []) {
    const file = good[b.file];
    if (!file) continue; // already reported as missing or damaged
    if (sha256Hex(file) !== b.sha256) {
      problems.push({ path: b.file, message: 'Picture bytes do not match the basemap checksum. Skipped.' });
      continue;
    }
    basemapFiles[b.basemapId] = file;
  }
  const speciesPhotos = readArray<SpeciesPhoto>(HQ_PATHS.speciesPhotos);
  const speciesPhotoFiles: Record<string, Uint8Array> = {};
  for (const ph of speciesPhotos ?? []) {
    const file = good[ph.file];
    if (!file) continue; // already reported as missing or damaged
    if (sha256Hex(file) !== ph.sha256) {
      problems.push({ path: ph.file, message: 'Photo bytes do not match the species photo checksum. Skipped.' });
      continue;
    }
    speciesPhotoFiles[ph.taxonId] = file;
  }
  return {
    ok: true,
    manifest,
    hq: strip({
      project: readObject<Project>(HQ_PATHS.project),
      template: readObject<Template>(HQ_PATHS.template),
      overlay: readObject<Overlay>(HQ_PATHS.overlay),
      transects: readObject<TransectCollection>(HQ_PATHS.transects),
      speciesPack: readObject<SpeciesPack>(HQ_PATHS.speciesPack),
      attribution: attributionFile ? strFromU8(attributionFile) : undefined,
      receipts: readArray<Receipt>(HQ_PATHS.receipts),
      reviews: readArray<Review>(HQ_PATHS.reviews),
      corrections: readArray<CorrectionRequest>(HQ_PATHS.corrections),
      taxonDecisions: readArray<TaxonDecision>(HQ_PATHS.taxonDecisions),
      changeRequestDecisions: readArray<ChangeRequestDecision>(HQ_PATHS.changeRequestDecisions),
      basemaps,
      basemapFiles: basemaps ? basemapFiles : undefined,
      speciesPhotos,
      speciesPhotoFiles: speciesPhotos ? speciesPhotoFiles : undefined,
    }),
    problems,
    rejected,
    unknownFiles,
  };
}

function strip<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}
