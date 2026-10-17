// Builds the demo project in demo-data/: project, form template v1, transects, species pack and credits.
// Run: npm run demo-data -w shared    (then npm run fixtures -w shared)
//
// The transects are SYNTHETIC demo geometry inside the La Selva area, not real trails.
// The species pack is CONVERTED from demo-data/source/costa-rica-snakes.draft.json: values are only mapped,
// never invented or estimated.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lineString } from '@turf/helpers';
import { length } from '@turf/length';
import type {
  FieldDef,
  Project,
  Range,
  SpeciesPack,
  Taxon,
  Template,
  TraitKey,
  TraitRange,
  TransectCollection,
  TransectProps,
} from '../src/types';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '../../demo-data');
const write = (name: string, value: unknown) => {
  writeFileSync(join(OUT, name), typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n');
  console.log('wrote demo-data/' + name);
};

// ---------- project ----------

export const project: Project = {
  projectId: 'cr-herps',
  name: 'Costa Rica herp transects (demo)',
  timeZone: 'America/Costa_Rica',
  bbox: { latMin: 5.0, latMax: 11.5, lonMin: -88.0, lonMax: -82.0 },
  coordCheck: {
    baseToleranceM: { canopy: 30, open: 15 },
    accuracyMultiplier: 3,
    amberMultiplier: 3,
    maxSuggestions: 3,
    grids: ['utm16n', 'utm17n', 'crtm05'],
  },
  teams: [
    { teamId: 'hq', name: 'Base camp (HQ)', transectIds: [] },
    { teamId: 'team-a', name: 'Team A', transectIds: ['T-LS-01', 'T-LS-03'] },
    { teamId: 'team-b', name: 'Team B', transectIds: ['T-LS-02'] },
  ],
  people: [
    { personId: 'p-dm', name: 'Dana Mora', initials: 'DM', teamId: 'hq', role: 'data-manager' },
    { personId: 'p-pl', name: 'Priya Lal', initials: 'PL', teamId: 'hq', role: 'project-lead' },
    { personId: 'p-a-lead', name: 'Ana Rojas', initials: 'AR', teamId: 'team-a', role: 'team-lead' },
    { personId: 'p-a-1', name: 'Luis Vargas', initials: 'LV', teamId: 'team-a', role: 'surveyor' },
    { personId: 'p-a-2', name: 'Maya Chen', initials: 'MC', teamId: 'team-a', role: 'surveyor' },
    { personId: 'p-b-lead', name: 'Ben Okafor', initials: 'BO', teamId: 'team-b', role: 'team-lead' },
    { personId: 'p-b-1', name: 'Carla Mendez', initials: 'CM', teamId: 'team-b', role: 'surveyor' },
    { personId: 'p-b-2', name: 'Tom Reid', initials: 'TR', teamId: 'team-b', role: 'surveyor' },
  ],
};

// ---------- transects (synthetic) ----------

const transect = (props: Omit<TransectProps, 'lengthM'>, coords: [number, number][]) => {
  const lengthM = Math.round(length(lineString(coords), { units: 'meters' }));
  return { type: 'Feature' as const, properties: { ...props, lengthM }, geometry: { type: 'LineString' as const, coordinates: coords } };
};

export const transects: TransectCollection = {
  type: 'FeatureCollection',
  features: [
    transect(
      { transectId: 'T-LS-01', name: 'T-LS-01 Ridge (demo geometry, not a real trail)', teamId: 'team-a', habitat: 'canopy', direction: 'start-to-end', stationSpacingM: 50 },
      [[-84.012, 10.4262], [-84.0089, 10.4281], [-84.0052, 10.4297], [-84.0021, 10.4318], [-83.999, 10.4336]],
    ),
    transect(
      { transectId: 'T-LS-02', name: 'T-LS-02 Stream (demo geometry, not a real trail)', teamId: 'team-b', habitat: 'canopy', direction: 'start-to-end', stationSpacingM: 50 },
      [[-84.031, 10.4095], [-84.0287, 10.4128], [-84.0262, 10.4163], [-84.0241, 10.4199], [-84.0225, 10.4232]],
    ),
    transect(
      { transectId: 'T-LS-03', name: 'T-LS-03 Pasture edge (demo geometry, not a real trail)', teamId: 'team-a', habitat: 'open', direction: 'either' },
      [[-83.994, 10.404], [-83.9898, 10.4061], [-83.9851, 10.4079], [-83.9806, 10.4102]],
    ),
  ],
};

// ---------- form template v1 ----------

const yes = true;
let order = 0;
const f = (d: Omit<FieldDef, 'order' | 'addedInCore'>): FieldDef => ({ ...d, order: ++order, addedInCore: 1 });
const choices = (...pairs: [string, string][]) => pairs.map(([code, label]) => ({ code, label }));

const CLOUD = choices(['clear', 'Clear'], ['scattered', 'Scattered'], ['broken', 'Broken'], ['overcast', 'Overcast'], ['cannot-assess', "Can't assess (canopy)"]);
const RAIN = choices(['none', 'None'], ['mist', 'Mist'], ['drizzle', 'Drizzle'], ['rain', 'Rain'], ['heavy', 'Heavy rain']);
const WIND = choices(['0', '0 Calm'], ['1', '1 Light air'], ['2', '2 Light breeze'], ['3', '3 Gentle breeze'], ['4', '4 Moderate breeze'], ['5', '5 Fresh breeze'], ['6', '6+ Strong']);

const weather = (prefix: 'weatherStart' | 'weatherEnd', group: string, when: string): FieldDef[] => [
  f({ key: `${prefix}.airTempC`, path: `${prefix}.airTempC`, recordType: 'survey', label: `Air temperature (${when})`, type: 'number', unit: 'degC', tier: 'core', group, min: 15, max: 35, teamCan: ['range'], limits: { minFloor: 0, maxCeiling: 45 } }),
  f({ key: `${prefix}.cloud`, path: `${prefix}.cloud`, recordType: 'survey', label: `Cloud (${when})`, type: 'choice', choices: CLOUD, tier: 'core', group, required: yes }),
  f({ key: `${prefix}.rainNow`, path: `${prefix}.rainNow`, recordType: 'survey', label: `Rain now (${when})`, type: 'choice', choices: RAIN, tier: 'core', group, required: yes }),
  f({ key: `${prefix}.windBeaufort`, path: `${prefix}.windBeaufort`, recordType: 'survey', label: `Wind, Beaufort (${when})`, type: 'choice', choices: WIND, valueType: 'number', tier: 'core', group, required: yes }),
];

export const template: Template = {
  templateId: 'herp-ves-transect',
  name: 'Herp visual encounter survey (transect)',
  coreVersion: 1,
  publishedAt: '2026-10-15T09:00:00-06:00',
  publishedBy: 'p-dm',
  fields: [
    // survey: start
    f({ key: 'transectId', path: 'transectId', recordType: 'survey', label: 'Transect', type: 'transect', tier: 'core', group: 'start', required: yes, dwc: 'dwc:locationID' }),
    f({ key: 'surveyorIds', path: 'surveyorIds', recordType: 'survey', label: 'Surveyors', type: 'people', tier: 'core', group: 'start', required: yes, dwc: 'dwc:recordedBy' }),
    f({ key: 'surveyorCount', path: 'surveyorCount', recordType: 'survey', label: 'Number of surveyors', type: 'number', tier: 'core', group: 'start', min: 1, max: 6, teamCan: ['default'] }),
    f({ key: 'startedAt', path: 'startedAt', recordType: 'survey', label: 'Start time', type: 'time', tier: 'core', group: 'start', required: yes, dwc: 'dwc:eventDate' }),
    ...weather('weatherStart', 'weather-start', 'start'),
    // survey: herp add-ons
    f({ key: 'herp.rainLast24h', path: 'herp.rainLast24h', recordType: 'survey', label: 'Rain in the last 24 h', type: 'choice', choices: choices(['none', 'None'], ['light', 'Light'], ['heavy', 'Heavy']), tier: 'team', group: 'herp', teamCan: ['show-hide', 'default'] }),
    f({ key: 'herp.hoursSinceRain', path: 'herp.hoursSinceRain', recordType: 'survey', label: 'Hours since rain', type: 'number', unit: 'h', tier: 'team', group: 'herp', min: 0, max: 72, teamCan: ['show-hide'] }),
    f({ key: 'herp.relativeHumidityPct', path: 'herp.relativeHumidityPct', recordType: 'survey', label: 'Relative humidity', type: 'number', unit: 'pct', tier: 'team', group: 'herp', min: 30, max: 100, teamCan: ['show-hide'] }),
    f({ key: 'herp.substrateTempC', path: 'herp.substrateTempC', recordType: 'survey', label: 'Substrate temperature', type: 'number', unit: 'degC', tier: 'team', group: 'herp', hidden: yes, teamCan: ['show-hide'] }),
    f({ key: 'herp.moonVisible', path: 'herp.moonVisible', recordType: 'survey', label: 'Moon (night surveys)', type: 'choice', choices: choices(['visible', 'Visible'], ['behind-cloud', 'Behind cloud'], ['not-up', 'Not up']), tier: 'team', group: 'herp', teamCan: ['show-hide'] }),
    f({ key: 'herp.leafLitterMoisture', path: 'herp.leafLitterMoisture', recordType: 'survey', label: 'Leaf litter (night surveys)', type: 'choice', choices: choices(['dry', 'Dry'], ['damp', 'Damp'], ['wet', 'Wet']), tier: 'team', group: 'herp', teamCan: ['show-hide'] }),
    // survey: end
    f({ key: 'finishedAt', path: 'finishedAt', recordType: 'survey', label: 'Finish time', type: 'time', tier: 'core', group: 'weather-end' }),
    ...weather('weatherEnd', 'weather-end', 'end'),
    f({ key: 'survey.notes', path: 'notes', recordType: 'survey', label: 'Survey notes', type: 'text', tier: 'free', group: 'notes', dwc: 'dwc:eventRemarks' }),

    // encounter: the animal
    f({ key: 'taxon', path: 'taxon', recordType: 'encounter', label: 'Species', type: 'taxon', tier: 'core', group: 'animal', required: yes, teamCan: ['choices-subset'], dwc: 'dwc:scientificName', help: 'Pick from the site list, use the scale-count key, or mark unidentified and take a photo.' }),
    f({ key: 'sex', path: 'sex', recordType: 'encounter', label: 'Sex', type: 'choice', choices: choices(['male', 'Male'], ['female', 'Female'], ['indeterminate', 'Indeterminate'], ['not-assessed', 'Not assessed']), default: 'not-assessed', tier: 'core', group: 'animal', required: yes, dwc: 'dwc:sex' }),
    f({ key: 'sexMethod', path: 'sexMethod', recordType: 'encounter', label: 'How sexed', type: 'choice', choices: choices(['probing', 'Probing'], ['popping', 'Popping'], ['secondary-characters', 'Secondary characters'], ['other', 'Other']), tier: 'core', group: 'animal', teamCan: ['show-hide', 'default'] }),
    f({ key: 'lifeStage', path: 'lifeStage', recordType: 'encounter', label: 'Life stage', type: 'choice', choices: choices(['hatchling', 'Hatchling'], ['juvenile', 'Juvenile'], ['subadult', 'Subadult'], ['adult', 'Adult'], ['tadpole', 'Tadpole'], ['metamorph', 'Metamorph'], ['unknown', 'Unknown']), tier: 'core', group: 'animal', required: yes, teamCan: ['choices-subset', 'default'], dwc: 'dwc:lifeStage' }),
    // encounter: measurements
    f({ key: 'mass', path: 'mass', recordType: 'encounter', label: 'Mass', type: 'measurement', unit: 'g', choices: choices(['pesola-10', 'Pesola 10 g (0.1 g)'], ['pesola-100', 'Pesola 100 g (1 g)'], ['pesola-500', 'Pesola 500 g (5 g)'], ['digital', 'Digital scale']), tier: 'core', group: 'measurements', min: 0.1, max: 6000, teamCan: ['range', 'default'], limits: { minFloor: 0, maxCeiling: 10000 }, dwc: 'MoF: mass' }),
    f({ key: 'svl', path: 'svl', recordType: 'encounter', label: 'Snout–vent length (SVL)', type: 'measurement', unit: 'mm', choices: choices(['ruler', 'Ruler'], ['tape', 'Tape'], ['squeeze-box', 'Squeeze box'], ['calipers', 'Calipers']), tier: 'core', group: 'measurements', min: 50, max: 2500, teamCan: ['range', 'default'], limits: { minFloor: 5, maxCeiling: 4000 }, dwc: 'MoF: snout-vent length' }),
    f({ key: 'tailLength', path: 'tailLength', recordType: 'encounter', label: 'Tail length', type: 'measurement', unit: 'mm', tier: 'core', group: 'measurements', min: 5, max: 1000, teamCan: ['range'], limits: { minFloor: 0, maxCeiling: 2000 }, dwc: 'MoF: tail length' }),
    f({ key: 'tailCondition', path: 'tailCondition', recordType: 'encounter', label: 'Tail condition', type: 'choice', choices: choices(['intact', 'Intact'], ['regenerated', 'Regenerated'], ['broken', 'Broken']), default: 'intact', tier: 'core', group: 'measurements', help: 'Subcaudal counts are ignored unless the tail is intact.' }),
    // encounter: where
    f({ key: 'location', path: 'location', recordType: 'encounter', label: 'GPS point', type: 'location', tier: 'core', group: 'location', required: yes, dwc: 'dwc:decimalLatitude' }),
    f({ key: 'distanceAlongM', path: 'distanceAlongM', recordType: 'encounter', label: 'Distance along transect', type: 'number', unit: 'm', tier: 'core', group: 'location', help: 'Filled in from the GPS point. Edit only if you measured it.' }),
    // encounter: scale counts (the key's inputs)
    f({ key: 'scaleCounts.dorsalRowsMidbody', path: 'scaleCounts.dorsalRowsMidbody', recordType: 'encounter', label: 'Dorsal scale rows at midbody', type: 'number', tier: 'core', group: 'scales', min: 8, max: 80, teamCan: ['show-hide'], dwc: 'MoF: dorsal scale rows at midbody' }),
    f({ key: 'scaleCounts.ventrals', path: 'scaleCounts.ventrals', recordType: 'encounter', label: 'Ventral scales', type: 'number', tier: 'core', group: 'scales', min: 90, max: 350, teamCan: ['show-hide'], dwc: 'MoF: ventral scale count' }),
    f({ key: 'scaleCounts.subcaudals', path: 'scaleCounts.subcaudals', recordType: 'encounter', label: 'Subcaudal scales', type: 'number', tier: 'core', group: 'scales', min: 10, max: 200, teamCan: ['show-hide'], dwc: 'MoF: subcaudal scale count' }),
    f({ key: 'scaleCounts.analPlate', path: 'scaleCounts.analPlate', recordType: 'encounter', label: 'Anal plate', type: 'choice', choices: choices(['single', 'Single'], ['divided', 'Divided']), tier: 'core', group: 'scales', teamCan: ['show-hide'] }),
    f({ key: 'scaleCounts.keeled', path: 'scaleCounts.keeled', recordType: 'encounter', label: 'Dorsal scales', type: 'choice', choices: choices(['smooth', 'Smooth'], ['weak', 'Weakly keeled'], ['keeled', 'Keeled']), tier: 'core', group: 'scales', teamCan: ['show-hide'] }),
    f({ key: 'scaleCounts.loreal', path: 'scaleCounts.loreal', recordType: 'encounter', label: 'Loreal scale', type: 'choice', choices: choices(['present', 'Present'], ['absent', 'Absent']), tier: 'core', group: 'scales', teamCan: ['show-hide'] }),
    f({ key: 'scaleCounts.pupil', path: 'scaleCounts.pupil', recordType: 'encounter', label: 'Pupil', type: 'choice', choices: choices(['round', 'Round'], ['vertical', 'Vertical'], ['horizontal', 'Horizontal']), tier: 'core', group: 'scales', teamCan: ['show-hide'] }),
    f({ key: 'photoIds', path: 'photoIds', recordType: 'encounter', label: 'Photos', type: 'photos', tier: 'core', group: 'animal', help: 'Dorsal, ventral and head if you can.' }),
    // encounter: optional extras (a Team Lead may show or hide them)
    f({ key: 'extras.encounterType', path: 'extras.encounterType', recordType: 'encounter', label: 'Captured or sighted', type: 'choice', choices: choices(['captured', 'Captured'], ['sighted', 'Sighted only']), default: 'captured', tier: 'team', group: 'extras', teamCan: ['show-hide', 'default'] }),
    f({ key: 'extras.microhabitat', path: 'extras.microhabitat', recordType: 'encounter', label: 'Microhabitat', type: 'choice', choices: choices(['leaf-litter', 'Leaf litter'], ['log', 'Log or bark'], ['vegetation', 'Low vegetation'], ['tree', 'Tree or branch'], ['stream-edge', 'Stream edge'], ['trail', 'Trail'], ['other', 'Other']), tier: 'team', group: 'extras', hidden: yes, teamCan: ['show-hide', 'choices-subset'] }),
    f({ key: 'extras.behaviour', path: 'extras.behaviour', recordType: 'encounter', label: 'Behaviour', type: 'text', tier: 'team', group: 'extras', hidden: yes, teamCan: ['show-hide'], dwc: 'dwc:behavior' }),
    f({ key: 'extras.gravid', path: 'extras.gravid', recordType: 'encounter', label: 'Gravid', type: 'boolean', tier: 'team', group: 'extras', hidden: yes, teamCan: ['show-hide'] }),
    f({ key: 'extras.injuries', path: 'extras.injuries', recordType: 'encounter', label: 'Injuries or disease signs', type: 'text', tier: 'team', group: 'extras', hidden: yes, teamCan: ['show-hide'] }),
    f({ key: 'extras.markId', path: 'extras.markId', recordType: 'encounter', label: 'Mark-recapture ID', type: 'text', tier: 'team', group: 'extras', hidden: yes, teamCan: ['show-hide'] }),
    f({ key: 'encounter.notes', path: 'notes', recordType: 'encounter', label: 'Notes', type: 'text', tier: 'free', group: 'notes', dwc: 'dwc:occurrenceRemarks' }),
  ],
  protocolRules: [
    { code: 'HEAVY_RAIN', fieldPath: 'weatherStart.rainNow', op: 'in', values: ['heavy'], message: "The protocol says don't survey in heavy rain. Save anyway?" },
    { code: 'STRONG_WIND', fieldPath: 'weatherStart.windBeaufort', op: 'gt', values: [4], message: 'Wind above Beaufort 4 lowers detection. Save anyway?' },
  ],
};

// ---------- species pack (converted, never invented) ----------

interface DraftTrait { trait: string; value: unknown; sex: string; verbatim?: string; source: string; licence: string; citedOriginal?: string }
interface DraftSpecies {
  scientificName: string;
  familyAsInGBIF?: string;
  gbifTaxonKey?: number;
  taxonomyFlag?: string;
  note?: string;
  traits?: DraftTrait[];
  referencePhotos?: { image: string; licence: string; rightsHolder: string; source: string }[];
}

const draft = JSON.parse(readFileSync(join(OUT, 'source/costa-rica-snakes.draft.json'), 'utf8')) as {
  packId: string; disclaimer: string; site: { name: string; bbox: SpeciesPack['site']['bbox'] }; species: DraftSpecies[];
};

const KEY_TRAITS: Record<string, TraitKey> = { dorsalRowsMidbody: 'dorsalRowsMidbody', ventrals: 'ventrals', subcaudals: 'subcaudals', analPlate: 'analPlate', ventralsUpperBound: 'ventrals', subcaudalsUpperBound: 'subcaudals' };
const DANGEROUS_FAMILIES = new Set(['Viperidae', 'Elapidae']);
export const skipped: string[] = [];

function toRange(v: unknown): Range | undefined {
  if (typeof v === 'number') return { min: v, max: v };
  if (v && typeof v === 'object') {
    const o = v as Record<string, number>;
    if (o.min !== undefined || o.max !== undefined) return { ...(o.min !== undefined ? { min: o.min } : {}), ...(o.max !== undefined ? { max: o.max } : {}) };
    if (o.lt !== undefined) return { max: o.lt - 1 }; // counts are whole numbers: "< 130" means at most 129
  }
  return undefined;
}

const sexOf = (s: string): TraitRange['sex'] => (s === 'male' || s === 'female' ? s : 'pooled');
const genusOf = (name: string) => name.split(' ')[0]!.toLowerCase();

function convert(s: DraftSpecies): Taxon {
  const traits: TraitRange[] = [];
  const size: NonNullable<Taxon['sizeRanges']> = {};
  const sizeSources: NonNullable<Taxon['sizeSources']> = [];
  const widen = (field: 'svlMm' | 'totalLengthMm', r: Range, t: DraftTrait) => {
    const cur = size[field];
    size[field] = {
      ...(r.min !== undefined || cur?.min !== undefined ? { min: Math.min(r.min ?? Infinity, cur?.min ?? Infinity) } : {}),
      ...(r.max !== undefined || cur?.max !== undefined ? { max: Math.max(r.max ?? -Infinity, cur?.max ?? -Infinity) } : {}),
    };
    if (size[field]!.min === Infinity) delete size[field]!.min;
    sizeSources.push({ field, source: t.source, licence: t.licence, ...(t.verbatim ? { verbatim: t.verbatim } : {}) });
  };

  for (const t of s.traits ?? []) {
    // A value whose source page is for a different genus can't be trusted for this species.
    if (t.source.includes('genus=') && !t.source.toLowerCase().includes(`genus=${genusOf(s.scientificName)}`)) {
      skipped.push(`${s.scientificName}: ${t.trait} (source page is for another genus)`);
      continue;
    }
    const key = KEY_TRAITS[t.trait];
    if (key === 'analPlate') {
      if (t.value === 'single' || t.value === 'divided') {
        traits.push({ trait: 'analPlate', sex: sexOf(t.sex), values: [t.value], source: t.source, licence: t.licence, ...(t.verbatim ? { verbatim: t.verbatim } : {}), ...(t.citedOriginal ? { citedOriginal: t.citedOriginal } : {}) });
      } else skipped.push(`${s.scientificName}: analPlate value ${JSON.stringify(t.value)} is not single/divided`);
      continue;
    }
    if (key) {
      const range = toRange(t.value);
      if (!range) { skipped.push(`${s.scientificName}: ${t.trait} has no usable number`); continue; }
      traits.push({ trait: key, sex: sexOf(t.sex), range, source: t.source, licence: t.licence, ...(t.verbatim ? { verbatim: t.verbatim } : {}), ...(t.citedOriginal ? { citedOriginal: t.citedOriginal } : {}) });
      continue;
    }
    if (t.trait === 'SVL_mm') { const r = toRange(t.value); if (r) widen('svlMm', r, t); continue; }
    if (t.trait === 'maxTotalLength_mm' || t.trait === 'maxLength_mm') {
      if (typeof t.value === 'number') widen('totalLengthMm', { max: t.value }, t);
      continue;
    }
    skipped.push(`${s.scientificName}: ${t.trait} (not a key trait or a size range)`);
  }

  const photos = (s.referencePhotos ?? [])
    .filter((p) => !/-nc|by-nc|noncommercial/i.test(p.licence))
    .map((p) => ({ url: p.image, licence: p.licence, rightsHolder: p.rightsHolder, source: p.source }));

  return {
    taxonId: s.gbifTaxonKey ? `gbif:${s.gbifTaxonKey}` : `pack:${s.scientificName.toLowerCase().replace(/\s+/g, '-')}`,
    scientificName: s.scientificName,
    ...(s.familyAsInGBIF ? { family: s.familyAsInGBIF } : {}),
    ...(s.familyAsInGBIF && DANGEROUS_FAMILIES.has(s.familyAsInGBIF) ? { dangerous: true } : {}),
    traits,
    ...(Object.keys(size).length ? { sizeRanges: size, sizeSources } : {}),
    ...(photos.length ? { photos } : {}),
    ...(s.taxonomyFlag ? { note: s.taxonomyFlag } : {}),
  };
}

export const speciesPack: SpeciesPack = {
  packId: 'cr-la-selva-snakes-demo',
  version: 1,
  status: 'draft',
  // The draft's own wording already says it's not for field ID, so don't say it twice.
  disclaimer: draft.disclaimer.replace(/^DEMO ONLY: not for identifying snakes in the field\. /, 'Illustrative demo pack, not for field ID. '),
  site: draft.site,
  taxa: draft.species.map(convert),
};

function attribution(): string {
  const lines = [
    '# Credits for the demo species pack',
    '',
    '**Illustrative demo pack, not for field ID.** Built from cited open sources during the Science Works hackathon,',
    '17 Oct 2026. The pack as a whole is shared under **CC BY 4.0**. Scale counts and sizes are facts; the short',
    'quoted source wording kept with each value carries its own licence, noted beside it. Those quotes are short',
    '(under 100 characters), kept for citation only, and are not relicensed by the pack\'s CC BY 4.0.',
    '',
    '- Species list: GBIF occurrence facet for the La Selva area, accessed 2026-10-17 (' + draft.site.name + ').',
    '- Taxonomic backbone: The Reptile Database via Catalogue of Life / ChecklistBank 2026-06, CC BY 4.0, https://doi.org/10.48580/d37s',
    '',
  ];
  for (const t of speciesPack.taxa) {
    const sources = new Map<string, string>();
    for (const tr of t.traits) sources.set(tr.source, tr.licence + (tr.citedOriginal ? `; cites ${tr.citedOriginal}` : ''));
    for (const ss of t.sizeSources ?? []) sources.set(ss.source, ss.licence);
    if (!sources.size && !t.photos?.length) continue;
    lines.push(`## *${t.scientificName}*`);
    for (const [src, lic] of sources) lines.push(`- Data: ${src} (${lic})`);
    for (const p of t.photos ?? []) lines.push(`- Photo: ${p.rightsHolder}, ${p.licence}, ${p.source}`);
    lines.push('');
  }
  return lines.join('\n');
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  write('project.json', project);
  write('template.json', template);
  write('transects.geojson', transects);
  write('species-pack.json', speciesPack);
  write('attribution.md', attribution());
  console.log(`\n${speciesPack.taxa.length} taxa, ${speciesPack.taxa.reduce((n, t) => n + t.traits.length, 0)} key-trait values.`);
  for (const t of transects.features) console.log(`${t.properties.transectId}: ${t.properties.lengthM} m`);
  console.log(`\nSkipped (not mapped, never guessed):\n- ${skipped.join('\n- ')}`);
}
