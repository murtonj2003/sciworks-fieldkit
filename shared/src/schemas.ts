// zod schemas mirroring types.ts, used to validate everything that arrives in a bundle.
// Objects are "loose": unknown fields are kept, never stripped (SHARED-CONTRACT §1, "be forgiving").

import { z } from 'zod';

const isoTime = z.string().min(10);
const code = z.string().min(1);
const uuid = z.string().min(8);

export const rangeSchema = z
  .looseObject({ min: z.number().optional(), max: z.number().optional() })
  .refine((r) => r.min !== undefined || r.max !== undefined, 'a range needs a min or a max');

export const bboxSchema = z.looseObject({
  latMin: z.number(),
  latMax: z.number(),
  lonMin: z.number(),
  lonMax: z.number(),
});

const unitSchema = z.enum(['mm', 'g', 'm', 'degC', 'pct', 'h']);
const coordFormatSchema = z.enum(['dd', 'dm', 'dms', 'utm16n', 'utm17n', 'crtm05']);

const measurement = (unit: 'mm' | 'g' | 'm') =>
  z.looseObject({
    value: z.number(),
    unit: z.literal(unit),
    method: z.string().optional(),
    precision: z.number().optional(),
  });

// ---------- set-up ----------

export const personSchema = z.looseObject({
  personId: code,
  name: z.string(),
  initials: z.string(),
  teamId: code,
  role: z.enum(['project-lead', 'data-manager', 'team-lead', 'surveyor']),
});

export const projectSchema = z.looseObject({
  projectId: code,
  name: z.string(),
  timeZone: z.string(),
  bbox: bboxSchema,
  coordCheck: z.looseObject({
    baseToleranceM: z.looseObject({ canopy: z.number(), open: z.number() }),
    accuracyMultiplier: z.number(),
    amberMultiplier: z.number(),
    maxSuggestions: z.number(),
    grids: z.array(coordFormatSchema),
  }),
  teams: z.array(z.looseObject({ teamId: code, name: z.string(), transectIds: z.array(code) })),
  people: z.array(personSchema),
  sensitiveTaxa: z.array(z.looseObject({ taxonId: z.string(), gridDeg: z.number() })).optional(),
});

const teamEditSchema = z.enum(['show-hide', 'default', 'range', 'label', 'choices-subset']);

export const fieldDefSchema = z.looseObject({
  key: z.string().min(1),
  path: z.string().min(1),
  recordType: z.enum(['survey', 'encounter']),
  label: z.string(),
  help: z.string().optional(),
  type: z.enum([
    'text', 'number', 'measurement', 'choice', 'multi-choice', 'boolean',
    'time', 'taxon', 'location', 'photos', 'people', 'transect',
  ]),
  tier: z.enum(['core', 'team', 'free']),
  unit: unitSchema.optional(),
  choices: z.array(z.looseObject({ code: z.string(), label: z.string() })).optional(),
  valueType: z.literal('number').optional(),
  required: z.boolean().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  default: z.unknown().optional(),
  hidden: z.boolean().optional(),
  group: z.string(),
  order: z.number(),
  teamCan: z.array(teamEditSchema).optional(),
  limits: z.looseObject({ minFloor: z.number().optional(), maxCeiling: z.number().optional() }).optional(),
  dwc: z.string().optional(),
  origin: z.enum(['hq', 'team']).optional(),
  addedInCore: z.number(),
});

export const templateSchema = z.looseObject({
  templateId: code,
  name: z.string(),
  coreVersion: z.number().int().positive(),
  publishedAt: isoTime,
  publishedBy: code,
  fields: z.array(fieldDefSchema),
  protocolRules: z
    .array(
      z.looseObject({
        code: z.string(),
        fieldPath: z.string(),
        op: z.enum(['in', 'lt', 'gt']),
        values: z.array(z.union([z.string(), z.number()])),
        message: z.string(),
      }),
    )
    .optional(),
});

export const overlaySchema = z.looseObject({
  templateId: code,
  coreVersion: z.number(),
  teamId: code,
  overlayRev: z.number().int().nonnegative(),
  changes: z.array(
    z.looseObject({ fieldKey: z.string(), what: teamEditSchema, value: z.unknown(), at: isoTime, by: code }),
  ),
  addedFields: z.array(fieldDefSchema),
  updatedAt: isoTime,
  updatedBy: code,
  deviceId: uuid,
});

const lineString = z.looseObject({
  type: z.literal('LineString'),
  coordinates: z.array(z.array(z.number()).min(2)).min(2),
});

export const transectSchema = z.looseObject({
  type: z.literal('Feature'),
  geometry: lineString,
  properties: z.looseObject({
    transectId: code,
    name: z.string(),
    teamId: code,
    lengthM: z.number(),
    habitat: z.enum(['canopy', 'open']),
    direction: z.enum(['start-to-end', 'either']),
    stationSpacingM: z.number().optional(),
  }),
});

export const transectCollectionSchema = z.looseObject({
  type: z.literal('FeatureCollection'),
  features: z.array(transectSchema),
});

export const traitRangeSchema = z.looseObject({
  trait: z.enum(['dorsalRowsMidbody', 'ventrals', 'subcaudals', 'analPlate', 'keeled', 'loreal', 'pupil']),
  sex: z.enum(['male', 'female', 'pooled']),
  range: rangeSchema.optional(),
  values: z.array(z.string()).optional(),
  source: z.string(),
  licence: z.string(),
  verbatim: z.string().optional(),
  citedOriginal: z.string().optional(),
});

export const taxonSchema = z.looseObject({
  taxonId: z.string(),
  scientificName: z.string(),
  family: z.string().optional(),
  commonName: z.string().optional(),
  dangerous: z.boolean().optional(),
  traits: z.array(traitRangeSchema),
  sizeRanges: z
    .looseObject({ svlMm: rangeSchema.optional(), massG: rangeSchema.optional(), totalLengthMm: rangeSchema.optional() })
    .optional(),
  photos: z
    .array(
      z.looseObject({
        file: z.string().optional(),
        url: z.string().optional(),
        licence: z.string(),
        rightsHolder: z.string(),
        source: z.string(),
      }),
    )
    .optional(),
});

export const basemapSchema = z.looseObject({
  basemapId: code,
  name: z.string(),
  file: z.string(),
  bytes: z.number(),
  sha256: z.string(),
  bounds: bboxSchema,
  widthPx: z.number(),
  heightPx: z.number(),
  resolutionM: z.number(),
  transectIds: z.array(code).optional(),
  source: z.string(),
  licence: z.string(),
  attribution: z.string(),
});

export const speciesPackSchema = z.looseObject({
  packId: z.string(),
  version: z.number(),
  status: z.enum(['draft', 'verified']),
  disclaimer: z.string(),
  site: z.looseObject({ name: z.string(), bbox: bboxSchema }),
  taxa: z.array(taxonSchema),
});

// ---------- records ----------

const stampShape = {
  id: uuid,
  rev: z.number().int().positive(),
  projectId: code,
  teamId: code,
  deviceId: uuid,
  createdBy: code,
  createdAt: isoTime,
  updatedAt: isoTime,
  templateId: code,
  coreVersion: z.number().int().positive(),
  overlayRev: z.number().int().nonnegative(),
  status: z.enum(['active', 'void']),
  teamFields: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
};

export const weatherBlockSchema = z.looseObject({
  at: isoTime,
  airTempC: z.number().optional(),
  cloud: z.enum(['clear', 'scattered', 'broken', 'overcast', 'cannot-assess']),
  rainNow: z.enum(['none', 'mist', 'drizzle', 'rain', 'heavy']),
  windBeaufort: z.number().int().min(0).max(6),
});

export const surveySchema = z.looseObject({
  ...stampShape,
  recordType: z.literal('survey'),
  transectId: code,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startedAt: isoTime,
  finishedAt: isoTime.optional(),
  surveyorIds: z.array(code),
  surveyorCount: z.number().int().nonnegative(),
  effortPersonHours: z.number().optional(),
  weatherStart: weatherBlockSchema,
  weatherEnd: weatherBlockSchema.optional(),
  herp: z.looseObject({}).optional(),
  astro: z.looseObject({}).optional(),
  protocolWarnings: z.array(z.looseObject({ code: z.string(), message: z.string(), acknowledgedAt: isoTime })).optional(),
  notes: z.string().optional(),
});

export const coordCheckSchema = z.looseObject({
  checkerVersion: z.string(),
  transectId: code,
  offsetM: z.number(),
  chainageM: z.number(),
  toleranceM: z.number(),
  band: z.enum(['green', 'amber', 'red', 'outside-bbox']),
  flags: z.array(z.string()),
  suggestions: z.array(z.looseObject({ kind: z.string(), lat: z.number(), lon: z.number(), offsetM: z.number() })),
  decision: z
    .looseObject({
      kind: z.enum(['kept-original', 'accepted-suggestion', 're-taken', 'override']),
      suggestionKind: z.string().optional(),
      reason: z.string().optional(),
      by: code,
      at: isoTime,
    })
    .optional(),
});

export const locationSchema = z.looseObject({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  accuracyM: z.number().positive().optional(),
  source: z.enum(['garmin-gpx', 'phone-gps', 'typed']),
  typed: z.looseObject({ raw: z.string(), format: coordFormatSchema }).optional(),
  original: z.looseObject({ lat: z.number(), lon: z.number() }).optional(),
  check: coordCheckSchema,
});

export const encounterSchema = z.looseObject({
  ...stampShape,
  recordType: z.literal('encounter'),
  surveyId: uuid,
  transectId: code,
  observedAt: isoTime,
  observerId: code,
  taxon: z.looseObject({
    taxonId: z.string().optional(),
    provisionalTaxonId: uuid.optional(),
    scientificName: z.string().optional(),
    unidentified: z.boolean().optional(),
    idBasis: z.enum(['in-hand', 'scale-key', 'visual', 'photo-later']),
    keyRun: z.looseObject({}).optional(),
  }),
  sex: z.enum(['male', 'female', 'indeterminate', 'not-assessed']),
  sexMethod: z.enum(['probing', 'popping', 'secondary-characters', 'other']).optional(),
  lifeStage: z.enum(['hatchling', 'juvenile', 'subadult', 'adult', 'tadpole', 'metamorph', 'unknown']),
  mass: measurement('g').optional(),
  svl: measurement('mm').optional(),
  tailLength: measurement('mm').optional(),
  tailCondition: z.enum(['intact', 'regenerated', 'broken']).optional(),
  location: locationSchema,
  distanceAlongM: z.looseObject({ value: z.number(), source: z.enum(['auto', 'typed']) }).optional(),
  scaleCounts: z.looseObject({}).optional(),
  photoIds: z.array(uuid),
  extras: z.looseObject({}).optional(),
  notes: z.string().optional(),
});

export const photoSchema = z.looseObject({
  photoId: uuid,
  recordId: uuid,
  role: z.enum(['dorsal', 'ventral', 'head', 'habitat', 'other']).optional(),
  file: z.string(),
  takenAt: isoTime,
  bytes: z.number().int().nonnegative(),
  sha256: z.string().length(64),
  widthPx: z.number().int().positive(),
  heightPx: z.number().int().positive(),
});

export const provisionalTaxonSchema = z.looseObject({
  provisionalTaxonId: uuid,
  proposedName: z.string(),
  rank: z.enum(['species', 'genus', 'family', 'morphospecies']).optional(),
  teamId: code,
  createdBy: code,
  deviceId: uuid,
  createdAt: isoTime,
});

export const changeRequestSchema = z.looseObject({
  changeRequestId: uuid,
  teamId: code,
  createdBy: code,
  deviceId: uuid,
  createdAt: isoTime,
  templateId: code,
  coreVersion: z.number(),
  kind: z.enum(['promote-team-field', 'change-core-field', 'new-field', 'other']),
  fieldKey: z.string().optional(),
  proposal: z.string(),
  reason: z.string().optional(),
});

export const correctionResponseSchema = z.looseObject({
  correctionId: uuid,
  decision: z.enum(['accepted', 'declined']),
  newRev: z.number().optional(),
  note: z.string().optional(),
  by: code,
  at: isoTime,
});

// ---------- feedback ----------

const recordTypeSchema = z.enum(['survey', 'encounter']);

export const receiptSchema = z.looseObject({
  recordType: recordTypeSchema,
  id: uuid,
  rev: z.number().int().positive(),
  receivedAt: isoTime,
});

export const reviewSchema = z.looseObject({
  recordType: recordTypeSchema,
  id: uuid,
  rev: z.number().int().positive(),
  status: z.enum(['received', 'flagged', 'edited', 'approved', 'rejected']),
  note: z.string().optional(),
  by: code,
  at: isoTime,
});

export const correctionRequestSchema = z.looseObject({
  correctionId: uuid,
  recordType: recordTypeSchema,
  recordId: uuid,
  rev: z.number().int().positive(),
  fieldPath: z.string(),
  current: z.unknown(),
  proposed: z.unknown(),
  reason: z.string(),
  source: z.enum(['ai-agent', 'data-manager']),
  approvedBy: code,
  createdAt: isoTime,
});

export const taxonDecisionSchema = z.looseObject({
  provisionalTaxonId: uuid,
  decision: z.enum(['approved', 'mapped', 'rejected']),
  taxonId: z.string().optional(),
  by: code,
  at: isoTime,
});

export const changeRequestDecisionSchema = z.looseObject({
  changeRequestId: uuid,
  decision: z.enum(['accepted', 'declined']),
  inCoreVersion: z.number().optional(),
  by: code,
  at: isoTime,
});

// ---------- manifest ----------

export const manifestSchema = z.looseObject({
  format: z.literal('sciworks-bundle'),
  contractVersion: z.string(),
  bundleType: z.enum(['field', 'hq']),
  bundleId: uuid,
  createdAt: isoTime,
  createdBy: z.looseObject({
    app: z.enum(['field', 'hq']),
    appVersion: z.string(),
    deviceId: uuid.optional(),
    personId: code.optional(),
  }),
  projectId: code,
  teamId: code,
  coreVersion: z.number(),
  overlayRev: z.number().optional(),
  scope: z.enum(['unconfirmed', 'full']).optional(),
  contents: z.array(
    z.looseObject({ path: z.string(), bytes: z.number(), sha256: z.string(), count: z.number().optional() }),
  ),
});
