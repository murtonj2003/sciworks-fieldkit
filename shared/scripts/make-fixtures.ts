// Makes the golden sample bundles both apps test against (SHARED-CONTRACT §9):
//   shared/fixtures/FIELD_sample.zip  (phone → HQ)     shared/fixtures/HQ_sample.zip  (HQ → phone)
// Run: npm run fixtures -w shared   (after npm run demo-data -w shared). Same input → same bytes.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  astroFor,
  checkCoordinate,
  checkRanges,
  measureAgainstTransect,
  parseTyped,
  sha256Hex,
  writeBundle,
  type Basemap,
  type ChangeRequest,
  type CorrectionRequest,
  type Encounter,
  type FieldDef,
  type Overlay,
  type Photo,
  type Project,
  type ProvisionalTaxon,
  type Receipt,
  type Review,
  type SpeciesPack,
  type Survey,
  type Template,
  type Transect,
  type TransectCollection,
} from '../src/index';

const here = dirname(fileURLToPath(import.meta.url));
const DEMO = join(here, '../../demo-data');
const OUT = join(here, '../fixtures');
const readJson = <T>(name: string) => JSON.parse(readFileSync(join(DEMO, name), 'utf8')) as T;

export const project = readJson<Project>('project.json');
export const template = readJson<Template>('template.json');
export const transects = readJson<TransectCollection>('transects.geojson');
export const speciesPack = readJson<SpeciesPack>('species-pack.json');
export const attribution = readFileSync(join(DEMO, 'attribution.md'), 'utf8');
// The satellite picture is made by demo-data/basemaps/make-basemap.py (needs rasterio); its output is committed.
export const basemaps = readJson<Basemap[]>('basemaps/index.json');
export const basemapFiles = Object.fromEntries(
  basemaps.map((b) => [b.basemapId, new Uint8Array(readFileSync(join(DEMO, 'basemaps', `${b.basemapId}.jpg`)))]),
);

const t2 = transects.features.find((t) => t.properties.transectId === 'T-LS-02') as Transect;
const taxonId = (name: string) => {
  const t = speciesPack.taxa.find((x) => x.scientificName === name);
  if (!t) throw new Error(`${name} is not in the species pack`);
  return t.taxonId;
};

// Fixed ids so the fixtures are stable. UUIDv7-shaped.
export const IDS = {
  device: '0199f0a2-1c00-7a00-8000-00000000d0b1',
  survey: '0199f0a2-1c00-7a00-8000-000000000101',
  e1: '0199f0a2-1c00-7a00-8000-000000000201',
  e2: '0199f0a2-1c00-7a00-8000-000000000202',
  e3: '0199f0a2-1c00-7a00-8000-000000000203',
  photo1: '0199f0a2-1c00-7a00-8000-000000000301',
  photo2: '0199f0a2-1c00-7a00-8000-000000000302',
  provisional: '0199f0a2-1c00-7a00-8000-000000000401',
  changeRequest: '0199f0a2-1c00-7a00-8000-000000000501',
  fieldBundle: '0199f0a2-1c00-7a00-8000-000000000601',
  hqBundle: '0199f0a2-1c00-7a00-8000-000000000602',
  correction: '0199f0a2-1c00-7a00-8000-000000000701',
} as const;

/** The demo typo: a Garmin UTM northing with its 4th and 5th digits swapped. */
export const DEMO_TYPO = { raw: '16P 825749 1151370', format: 'utm16n' as const, correct: '16P 825749 1153170', accuracyM: 6 };

const stamp = (id: string, rev: number, createdAt: string, updatedAt: string, overlayRev: number) => ({
  id, rev, projectId: 'cr-herps', teamId: 'team-b', deviceId: IDS.device, createdBy: 'p-b-lead',
  createdAt, updatedAt, templateId: template.templateId, coreVersion: template.coreVersion, overlayRev, status: 'active' as const,
});

// A point a few metres east of T-LS-02 at a given fraction along one of its segments.
const nearLine = (segment: number, fraction: number, eastDeg = 0.00006) => {
  const c = t2.geometry.coordinates;
  const a = c[segment]!;
  const b = c[segment + 1]!;
  return { lat: a[1]! + (b[1]! - a[1]!) * fraction, lon: a[0]! + (b[0]! - a[0]!) * fraction + eastDeg };
};

// ---------- the night survey ----------

const startedAt = '2026-10-16T18:45:00-06:00';
const start = t2.geometry.coordinates[0]!;
export const survey: Survey = {
  ...stamp(IDS.survey, 4, startedAt, '2026-10-16T21:10:30-06:00', 1),
  recordType: 'survey',
  transectId: 'T-LS-02',
  date: '2026-10-16',
  startedAt,
  finishedAt: '2026-10-16T21:10:00-06:00',
  surveyorIds: ['p-b-lead', 'p-b-1', 'p-b-2'],
  surveyorCount: 3,
  effortPersonHours: 7.25,
  weatherStart: { at: startedAt, airTempC: 24.5, cloud: 'cannot-assess', rainNow: 'none', windBeaufort: 1 },
  weatherEnd: { at: '2026-10-16T21:10:00-06:00', airTempC: 23.8, cloud: 'cannot-assess', rainNow: 'drizzle', windBeaufort: 0 },
  herp: { rainLast24h: 'heavy', hoursSinceRain: 5, relativeHumidityPct: 94, moonVisible: 'behind-cloud', leafLitterMoisture: 'wet' },
  astro: astroFor(startedAt, start[1]!, start[0]!),
  notes: 'Fixture: night VES on T-LS-02 after heavy afternoon rain.',
};

// ---------- encounter 1: the swapped-digit coordinate, fixed in the field ----------

const typedPoint = parseTyped(DEMO_TYPO.raw, DEMO_TYPO.format);
if ('error' in typedPoint) throw new Error(typedPoint.error);
const typedCheck = checkCoordinate({ ...typedPoint, accuracyM: DEMO_TYPO.accuracyM, typed: DEMO_TYPO }, t2, project);
const fix = typedCheck.suggestions[0];
if (!fix || fix.kind !== 'digit-swap') throw new Error('The demo typo no longer produces a digit-swap suggestion');

const e1: Encounter = {
  ...stamp(IDS.e1, 3, '2026-10-16T19:12:00-06:00', '2026-10-16T19:15:40-06:00', 2),
  recordType: 'encounter',
  surveyId: IDS.survey,
  transectId: 'T-LS-02',
  observedAt: '2026-10-16T19:12:00-06:00',
  observerId: 'p-b-1',
  taxon: { taxonId: taxonId('Imantodes cenchoa'), scientificName: 'Imantodes cenchoa', idBasis: 'in-hand' },
  sex: 'male',
  sexMethod: 'probing',
  lifeStage: 'adult',
  mass: { value: 12, unit: 'g', method: 'pesola-100', precision: 1, scaleUsed: 'Pesola 100 g', bagTared: true },
  svl: { value: 640, unit: 'mm', method: 'ruler', precision: 1 },
  tailLength: { value: 290, unit: 'mm', method: 'ruler', precision: 1 },
  tailCondition: 'intact',
  location: {
    lat: fix.lat,
    lon: fix.lon,
    accuracyM: DEMO_TYPO.accuracyM,
    source: 'typed',
    typed: { raw: DEMO_TYPO.raw, format: DEMO_TYPO.format },
    original: { lat: typedPoint.lat, lon: typedPoint.lon },
    check: { ...typedCheck, decision: { kind: 'accepted-suggestion', suggestionKind: 'digit-swap', by: 'p-b-1', at: '2026-10-16T19:13:05-06:00' } },
  },
  distanceAlongM: { value: Math.round(fix.chainageM), source: 'auto' },
  photoIds: [IDS.photo1],
  extras: { encounterType: 'captured' },
  teamFields: { perchHeightM: 1.8 },
  notes: 'Fixture: Garmin UTM northing typed with two digits swapped; the suggestion was accepted.',
};

// ---------- encounter 2: SVL typed with an extra zero (out of the pack's range) ----------

const p2 = nearLine(3, 0.4);
const e2: Encounter = {
  ...stamp(IDS.e2, 1, '2026-10-16T19:58:00-06:00', '2026-10-16T20:01:10-06:00', 2),
  recordType: 'encounter',
  surveyId: IDS.survey,
  transectId: 'T-LS-02',
  observedAt: '2026-10-16T19:58:00-06:00',
  observerId: 'p-b-2',
  taxon: { taxonId: taxonId('Leptodeira ornata'), scientificName: 'Leptodeira ornata', idBasis: 'in-hand' },
  sex: 'female',
  sexMethod: 'probing',
  lifeStage: 'adult',
  mass: { value: 38, unit: 'g', method: 'pesola-100', precision: 1, scaleUsed: 'Pesola 100 g', bagTared: true },
  svl: { value: 4350, unit: 'mm', method: 'tape', precision: 1 },
  tailLength: { value: 140, unit: 'mm', method: 'tape', precision: 1 },
  tailCondition: 'intact',
  location: { ...p2, accuracyM: 5, source: 'phone-gps', check: checkCoordinate({ ...p2, accuracyM: 5 }, t2, project) },
  distanceAlongM: { value: Math.round(measureAgainstTransect(p2.lat, p2.lon, t2).chainageM), source: 'auto' },
  photoIds: [],
  extras: { encounterType: 'captured', microhabitat: 'stream-edge' },
  notes: 'Fixture: SVL typed as 4350 instead of 435. The range check and the AI reviewer should flag it.',
};

// ---------- encounter 3: identified with the scale-count key ----------

const p3 = nearLine(0, 0.6, -0.00004);
const e3: Encounter = {
  ...stamp(IDS.e3, 2, '2026-10-16T20:31:00-06:00', '2026-10-16T20:36:20-06:00', 2),
  recordType: 'encounter',
  surveyId: IDS.survey,
  transectId: 'T-LS-02',
  observedAt: '2026-10-16T20:31:00-06:00',
  observerId: 'p-b-lead',
  taxon: { taxonId: taxonId('Chironius grandisquamis'), scientificName: 'Chironius grandisquamis', idBasis: 'scale-key' },
  sex: 'not-assessed',
  lifeStage: 'adult',
  mass: { value: 210, unit: 'g', method: 'pesola-500', precision: 5, scaleUsed: 'Pesola 500 g', bagTared: true },
  svl: { value: 1120, unit: 'mm', method: 'tape', precision: 1 },
  tailLength: { value: 560, unit: 'mm', method: 'tape', precision: 1 },
  tailCondition: 'intact',
  location: { ...p3, accuracyM: 4, source: 'garmin-gpx', check: checkCoordinate({ ...p3, accuracyM: 4 }, t2, project) },
  distanceAlongM: { value: Math.round(measureAgainstTransect(p3.lat, p3.lon, t2).chainageM), source: 'auto' },
  scaleCounts: { dorsalRowsMidbody: 10, analPlate: 'divided' },
  photoIds: [IDS.photo2],
  extras: { encounterType: 'captured', microhabitat: 'vegetation' },
  notes: 'Fixture: keyed out from 10 midbody rows and a divided anal plate.',
};

export const encounters = [e1, e2, e3];

// ---------- photos, overlay, provisional species, change request ----------

const jpeg = (name: string) => new Uint8Array(readFileSync(join(here, 'assets', name)));
const photoBytes = { [IDS.photo1]: jpeg('photo-dorsal.jpg'), [IDS.photo2]: jpeg('photo-head.jpg') };
export const photos: Photo[] = [
  { photoId: IDS.photo1, recordId: IDS.e1, role: 'dorsal', file: `photos/${IDS.photo1}.jpg`, takenAt: '2026-10-16T19:14:00-06:00', bytes: photoBytes[IDS.photo1]!.length, sha256: sha256Hex(photoBytes[IDS.photo1]!), widthPx: 64, heightPx: 48 },
  { photoId: IDS.photo2, recordId: IDS.e3, role: 'head', file: `photos/${IDS.photo2}.jpg`, takenAt: '2026-10-16T20:34:00-06:00', bytes: photoBytes[IDS.photo2]!.length, sha256: sha256Hex(photoBytes[IDS.photo2]!), widthPx: 64, heightPx: 48 },
];

const perchHeight: FieldDef = {
  key: 'perchHeightM', path: 'teamFields.perchHeightM', recordType: 'encounter', label: 'Perch height', type: 'number',
  unit: 'm', tier: 'free', origin: 'team', group: 'extras', order: 100, min: 0, max: 30, addedInCore: 1,
  help: 'Added offline by the Team B lead.',
};

export const overlay: Overlay = {
  templateId: template.templateId,
  coreVersion: 1,
  teamId: 'team-b',
  overlayRev: 2,
  changes: [{ fieldKey: 'extras.microhabitat', what: 'show-hide', value: false, at: '2026-10-16T17:30:00-06:00', by: 'p-b-lead' }],
  addedFields: [perchHeight],
  updatedAt: '2026-10-16T19:05:00-06:00',
  updatedBy: 'p-b-lead',
  deviceId: IDS.device,
};

export const changeRequests: ChangeRequest[] = [{
  changeRequestId: IDS.changeRequest, teamId: 'team-b', createdBy: 'p-b-lead', deviceId: IDS.device, createdAt: '2026-10-16T19:05:00-06:00',
  templateId: template.templateId, coreVersion: 1, kind: 'promote-team-field', fieldKey: 'perchHeightM',
  proposal: "Add 'Perch height (m)' to the core form", reason: 'Most Imantodes and Oxybelis are found perched at night; height affects detection.',
}];

export const provisionalTaxa: ProvisionalTaxon[] = [{
  provisionalTaxonId: IDS.provisional, proposedName: 'Coniophanes sp.', rank: 'genus',
  notes: 'Small striped snake under leaf litter; not in the site list. Escaped before photos.',
  teamId: 'team-b', createdBy: 'p-b-lead', deviceId: IDS.device, createdAt: '2026-10-16T20:50:00-06:00',
}];

// ---------- HQ's feedback ----------

export const receipts: Receipt[] = [survey, ...encounters].map((r) => ({ recordType: r.recordType, id: r.id, rev: r.rev, receivedAt: '2026-10-17T07:10:00-06:00' }));
export const reviews: Review[] = [{ recordType: 'encounter', id: IDS.e3, rev: 2, status: 'approved', by: 'p-dm', at: '2026-10-17T07:20:00-06:00' }];
export const corrections: CorrectionRequest[] = [{
  correctionId: IDS.correction, recordType: 'encounter', recordId: IDS.e2, rev: 1, fieldPath: 'svl',
  current: e2.svl, proposed: { ...e2.svl, value: 435 },
  reason: 'SVL 4,350 mm is far above this pack’s maximum for Leptodeira ornata (646 mm); 435 mm fits. Was a zero added by mistake?',
  source: 'ai-agent', approvedBy: 'p-dm', createdAt: '2026-10-17T07:25:00-06:00',
}];

// ---------- write ----------

export function buildFieldBundle(): Uint8Array {
  return writeBundle({
    bundleType: 'field', bundleId: IDS.fieldBundle, createdAt: '2026-10-16T21:30:00-06:00',
    createdBy: { app: 'field', appVersion: '0.1.0-fixture', deviceId: IDS.device, personId: 'p-b-lead' },
    projectId: 'cr-herps', teamId: 'team-b', coreVersion: 1, overlayRev: 2, scope: 'unconfirmed',
    parts: { surveys: [survey], encounters, photos, photoFiles: photoBytes, overlay, provisionalTaxa, changeRequests, correctionResponses: [] },
  });
}

export function buildHqBundle(): Uint8Array {
  return writeBundle({
    bundleType: 'hq', bundleId: IDS.hqBundle, createdAt: '2026-10-17T07:30:00-06:00',
    createdBy: { app: 'hq', appVersion: '0.1.0-fixture', personId: 'p-dm' },
    projectId: 'cr-herps', teamId: 'team-b', coreVersion: 1, overlayRev: 2,
    parts: { project, template, overlay, transects, speciesPack, attribution, receipts, reviews, corrections, taxonDecisions: [], changeRequestDecisions: [], basemaps, basemapFiles },
  });
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  writeFileSync(join(OUT, 'FIELD_sample.zip'), buildFieldBundle());
  writeFileSync(join(OUT, 'HQ_sample.zip'), buildHqBundle());
  const facts = {
    demoTypo: {
      typed: DEMO_TYPO.raw, correct: DEMO_TYPO.correct, format: DEMO_TYPO.format, transect: 'T-LS-02',
      band: typedCheck.band, offTransectM: typedCheck.offsetM, toleranceM: typedCheck.toleranceM,
      suggestion: fix.explain, fixedOffsetM: fix.offsetM, fixedDistanceAlongM: Math.round(fix.chainageM),
      suggestionsOffered: typedCheck.suggestions.length,
    },
    rangeWarningsOnE2: checkRanges(e2, speciesPack).map((w) => w.message),
    survey: { astro: survey.astro, effortPersonHours: survey.effortPersonHours },
    counts: { surveys: 1, encounters: encounters.length, photos: photos.length, provisionalTaxa: 1, changeRequests: 1, receipts: receipts.length, reviews: reviews.length, corrections: corrections.length },
  };
  writeFileSync(join(OUT, 'facts.json'), JSON.stringify(facts, null, 2) + '\n');
  console.log('wrote shared/fixtures/FIELD_sample.zip, HQ_sample.zip, facts.json');
  console.log(JSON.stringify(facts, null, 2));
}
