// The shared contract between the Field app (phones) and the HQ app (laptop).
// Mirrors briefs/SHARED-CONTRACT.md. If this file and that document disagree, this file wins.
// Pure types: no platform APIs, no React. Safe for Metro (Babel) and Vite (esbuild).

import type { Feature, FeatureCollection, LineString } from 'geojson';

export const CONTRACT_VERSION = '1.0.0';

// ---------- basics (§4) ----------

/** UUIDv7, lowercase, made on the device that creates the thing. */
export type Uuid = string;
/** Short readable id set up by HQ: 'T-LS-01', 'team-b', 'p-ana'. */
export type Code = string;
/** ISO 8601 with offset: '2026-10-17T19:42:10-06:00'. */
export type IsoTime = string;
/** 'YYYY-MM-DD', site-local. */
export type IsoDate = string;
export type Unit = 'mm' | 'g' | 'm' | 'degC' | 'pct' | 'h';

/** A bound the source doesn't give is left out, never guessed. At least one of min / max is present. */
export interface Range {
  min?: number;
  max?: number;
}

export interface BBox {
  latMin: number;
  latMax: number;
  lonMin: number;
  lonMax: number;
}

export interface Measurement<U extends Unit = Unit> {
  value: number;
  unit: U;
  /** A choice code from the template, e.g. 'ruler', 'squeeze-box', 'calipers', 'pesola'. */
  method?: string;
  /** The instrument's smallest division, in the same unit. */
  precision?: number;
}

export type Role = 'project-lead' | 'data-manager' | 'team-lead' | 'surveyor';

export interface Person {
  personId: Code;
  name: string;
  initials: string;
  teamId: Code;
  role: Role;
}

export interface Team {
  teamId: Code;
  name: string;
  transectIds: Code[];
}

// ---------- project set-up, made by HQ (§4) ----------

export type CoordFormat = 'dd' | 'dm' | 'dms' | 'utm16n' | 'utm17n' | 'crtm05';

export interface CoordCheckConfig {
  /** Base tolerance in metres: 30 under canopy, 15 in the open. */
  baseToleranceM: { canopy: number; open: number };
  /** tolerance = max(base, accuracyMultiplier × accuracy). */
  accuracyMultiplier: number;
  /** green ≤ tol · amber ≤ amberMultiplier × tol · red beyond. */
  amberMultiplier: number;
  maxSuggestions: number;
  /** Grids to try re-reading typed numbers in, e.g. ['utm16n', 'utm17n', 'crtm05']. */
  grids: CoordFormat[];
}

export interface Project {
  projectId: Code;
  name: string;
  /** IANA zone, e.g. 'America/Costa_Rica' (UTC−6, no daylight saving). */
  timeZone: string;
  /** Anything outside is flagged OUTSIDE_PROJECT_BBOX. */
  bbox: BBox;
  coordCheck: CoordCheckConfig;
  teams: Team[];
  people: Person[];
  /** HQ export only (P3). */
  sensitiveTaxa?: { taxonId: string; gridDeg: 0.1 | 0.01 | 0.001 }[];
}

export interface TransectProps {
  transectId: Code;
  name: string;
  teamId: Code;
  /** Computed by HQ on import. */
  lengthM: number;
  /** Sets the base tolerance: 30 m under canopy, 15 m in the open. */
  habitat: 'canopy' | 'open';
  /** The order check runs only on one-way walks. */
  direction: 'start-to-end' | 'either';
  stationSpacingM?: number;
}

export type Transect = Feature<LineString, TransectProps>;
export type TransectCollection = FeatureCollection<LineString, TransectProps>;

/** 🔒 core: HQ only · 🔧 team: a Team Lead may tune it offline · ✏️ free: notes and tags. */
export type Tier = 'core' | 'team' | 'free';
export type TeamEdit = 'show-hide' | 'default' | 'range' | 'label' | 'choices-subset';
export type FieldType =
  | 'text'
  | 'number'
  | 'measurement'
  | 'choice'
  | 'multi-choice'
  | 'boolean'
  | 'time'
  | 'taxon'
  | 'location'
  | 'photos'
  | 'people'
  | 'transect';

export interface FieldDef {
  /** Stable machine name. NEVER renamed or retyped. */
  key: string;
  /** Where the value lives in the record: 'svl', 'weatherStart.airTempC', 'teamFields.perchHeightM'. */
  path: string;
  recordType: 'survey' | 'encounter';
  label: string;
  help?: string;
  type: FieldType;
  tier: Tier;
  unit?: Unit;
  choices?: { code: string; label: string }[];
  /** For 'choice' fields whose record value is a number (e.g. Beaufort wind): store Number(code). */
  valueType?: 'number';
  /** "Required" never blocks a save; the record shows as incomplete. */
  required?: boolean;
  /** Soft range: outside it shows "check?", never blocks. */
  min?: number;
  max?: number;
  default?: unknown;
  /** Optional fields can start hidden; a Team Lead may show them if allowed. */
  hidden?: boolean;
  /** Screen section: 'start' | 'weather-start' | 'herp' | 'animal' | 'measurements' | 'location' | 'scales' | 'extras' | 'weather-end' | 'notes'. */
  group: string;
  order: number;
  /** What a Team Lead may change offline. Absent = nothing. */
  teamCan?: TeamEdit[];
  /** A Team Lead's range must stay inside these. */
  limits?: { minFloor?: number; maxCeiling?: number };
  /** Darwin Core term for export, e.g. 'dwc:sex'. */
  dwc?: string;
  /** 'team' = added offline by a Team Lead (see Overlay). */
  origin?: 'hq' | 'team';
  /** The core version that introduced it. */
  addedInCore: number;
}

/** "Go / no-go" warnings: they warn, never block. */
export interface ProtocolRule {
  code: string;
  fieldPath: string;
  op: 'in' | 'lt' | 'gt';
  values: (string | number)[];
  message: string;
}

export interface Template {
  templateId: Code;
  name: string;
  /** 1, 2, 3… bumped only by HQ. */
  coreVersion: number;
  publishedAt: IsoTime;
  publishedBy: Code;
  fields: FieldDef[];
  protocolRules?: ProtocolRule[];
}

export interface OverlayChange {
  fieldKey: string;
  what: TeamEdit;
  /** show-hide: boolean (true = hidden) · default: the value · range: Range · label: string · choices-subset: string[] */
  value: unknown;
  at: IsoTime;
  by: Code;
}

/** A team's own form changes, made offline by the Team Lead. */
export interface Overlay {
  templateId: Code;
  /** The core it was made against. */
  coreVersion: number;
  teamId: Code;
  /** Bumped on the Team Lead's phone on every change. */
  overlayRev: number;
  /** In order; the latest wins per (fieldKey, what). */
  changes: OverlayChange[];
  /** Fields the Team Lead added: tier 'free', origin 'team', path 'teamFields.<key>'. */
  addedFields: FieldDef[];
  updatedAt: IsoTime;
  updatedBy: Code;
  deviceId: Uuid;
}

export type TraitKey =
  | 'dorsalRowsMidbody'
  | 'ventrals'
  | 'subcaudals'
  | 'analPlate'
  | 'keeled'
  | 'loreal'
  | 'pupil';

export interface TraitRange {
  trait: TraitKey;
  sex: 'male' | 'female' | 'pooled';
  /** For counts. */
  range?: Range;
  /** For categories, e.g. ['divided']. */
  values?: string[];
  /** URL. */
  source: string;
  licence: string;
  /** The source's own words. */
  verbatim?: string;
  citedOriginal?: string;
}

export interface TaxonPhoto {
  file?: string;
  url?: string;
  licence: string;
  rightsHolder: string;
  source: string;
}

export interface Taxon {
  /** 'gbif:5220796' */
  taxonId: string;
  scientificName: string;
  family?: string;
  commonName?: string;
  /** Venomous → red warning on screen. */
  dangerous?: boolean;
  traits: TraitRange[];
  /** For "check?" warnings. Pooled across sexes; each bound is cited in `sizeSources`. */
  sizeRanges?: { svlMm?: Range; massG?: Range; totalLengthMm?: Range };
  sizeSources?: { field: 'svlMm' | 'massG' | 'totalLengthMm'; source: string; licence: string; verbatim?: string }[];
  photos?: TaxonPhoto[];
  /** Taxonomy caveats carried over from the source pack. */
  note?: string;
}

export interface SpeciesPack {
  packId: string;
  version: number;
  status: 'draft' | 'verified';
  disclaimer: string;
  site: { name: string; bbox: BBox };
  taxa: Taxon[];
}

/**
 * One small photo of a species for the picker and the field notebook, offline. CC BY 4.0 or CC0 only; show
 * `credit` wherever the photo is visible. Sent HQ → phone in the HQ bundle. Added Sat 17 Oct (additive).
 */
export interface SpeciesPhoto {
  taxonId: string;
  /** Path inside the bundle, e.g. 'setup/species-photos/gbif-5220796.jpg'. */
  file: string;
  bytes: number;
  sha256: string;
  widthPx: number;
  heightPx: number;
  licence: string;
  /** "Name · CC BY 4.0 · via iNaturalist / GBIF". **Show it with the photo.** */
  credit: string;
  /** The GBIF occurrence the photo belongs to. */
  source: string;
  originalUrl?: string;
}

/**
 * A picture to draw under the transect lines, offline: a satellite image cut to the project area. It is a plain
 * lat/lon grid (EPSG:4326), north up, so its four corners are just `bounds`. Sent HQ → phone in the HQ bundle.
 * Added Sat 17 Oct 17:00 (additive: older apps ignore it).
 */
export interface Basemap {
  basemapId: Code;
  /** Shown in a layer switch, e.g. 'Satellite (Sentinel-2, 2021)'. */
  name: string;
  /** Path inside the bundle, e.g. 'setup/basemaps/la-selva-s2-2021.jpg'. */
  file: string;
  bytes: number;
  sha256: string;
  /** The picture's outer edges (not pixel centres). */
  bounds: BBox;
  widthPx: number;
  heightPx: number;
  /** Ground size of one pixel, roughly. */
  resolutionM: number;
  /** The transects it was cut for. */
  transectIds?: Code[];
  /** Where the pixels came from, precisely enough to remake the file. */
  source: string;
  licence: string;
  /** **Show this on screen whenever the picture is visible** (licence condition). */
  attribution: string;
}

// ---------- records, made on the phone (§5) ----------

export interface Stamp {
  id: Uuid;
  rev: number;
  projectId: Code;
  teamId: Code;
  deviceId: Uuid;
  /** personId */
  createdBy: Code;
  createdAt: IsoTime;
  updatedAt: IsoTime;
  templateId: Code;
  /** The form version it was entered with. */
  coreVersion: number;
  /** The team overlay it was entered with (0 = none). */
  overlayRev: number;
  status: 'active' | 'void';
  /** Values for team-added fields, keyed by fieldKey. */
  teamFields?: Record<string, string | number | boolean | null>;
}

export interface WeatherBlock {
  at: IsoTime;
  /** To 0.1 °C. */
  airTempC?: number;
  /** 'cannot-assess' = under canopy. */
  cloud: 'clear' | 'scattered' | 'broken' | 'overcast' | 'cannot-assess';
  rainNow: 'none' | 'mist' | 'drizzle' | 'rain' | 'heavy';
  /** 6 means "6 or more". */
  windBeaufort: 0 | 1 | 2 | 3 | 4 | 5 | 6;
}

export interface Astro {
  sunrise: IsoTime;
  sunset: IsoTime;
  /** 0 = new, 0.5 = full. */
  moonPhase: number;
  moonIlluminationPct: number;
  moonAboveHorizonAtStart: boolean;
  /** Negative = before sunset. */
  minutesAfterSunsetAtStart: number;
}

/** One walk of one transect = a Darwin Core Event. */
export interface Survey extends Stamp {
  recordType: 'survey';
  transectId: Code;
  date: IsoDate;
  startedAt: IsoTime;
  /** Absent = still in progress (still data; still exported). */
  finishedAt?: IsoTime;
  surveyorIds: Code[];
  surveyorCount: number;
  /** (finish − start) × surveyorCount, set on Finish. */
  effortPersonHours?: number;
  weatherStart: WeatherBlock;
  weatherEnd?: WeatherBlock;
  herp?: {
    rainLast24h?: 'none' | 'light' | 'heavy';
    hoursSinceRain?: number;
    relativeHumidityPct?: number;
    substrateTempC?: number;
    moonVisible?: 'visible' | 'behind-cloud' | 'not-up';
    leafLitterMoisture?: 'dry' | 'damp' | 'wet';
  };
  /** Calculated offline by astroFor(). */
  astro?: Astro;
  protocolWarnings?: { code: string; message: string; acknowledgedAt: IsoTime }[];
  notes?: string;
}

export interface ScaleCounts {
  dorsalRowsMidbody?: number;
  ventrals?: number;
  subcaudals?: number;
  analPlate?: 'single' | 'divided';
  keeled?: 'keeled' | 'smooth' | 'weak';
  loreal?: 'present' | 'absent';
  pupil?: 'round' | 'vertical' | 'horizontal';
}

export type Sex = 'male' | 'female' | 'indeterminate' | 'not-assessed';
export type TailCondition = 'intact' | 'regenerated' | 'broken';

/** One animal = a Darwin Core Occurrence. */
export interface Encounter extends Stamp {
  recordType: 'encounter';
  surveyId: Uuid;
  transectId: Code;
  observedAt: IsoTime;
  observerId: Code;
  taxon: {
    taxonId?: string;
    provisionalTaxonId?: Uuid;
    scientificName?: string;
    unidentified?: boolean;
    idBasis: 'in-hand' | 'scale-key' | 'visual' | 'photo-later';
    keyRun?: KeyResult;
  };
  sex: Sex;
  sexMethod?: 'probing' | 'popping' | 'secondary-characters' | 'other';
  lifeStage: 'hatchling' | 'juvenile' | 'subadult' | 'adult' | 'tadpole' | 'metamorph' | 'unknown';
  mass?: Measurement<'g'> & { scaleUsed?: string; bagTared?: boolean };
  svl?: Measurement<'mm'>;
  tailLength?: Measurement<'mm'>;
  /** Subcaudals are ignored unless 'intact'. */
  tailCondition?: TailCondition;
  location: Location;
  /** auto = chainage from the check. */
  distanceAlongM?: { value: number; source: 'auto' | 'typed' };
  scaleCounts?: ScaleCounts;
  photoIds: Uuid[];
  extras?: {
    encounterType?: 'captured' | 'sighted';
    microhabitat?: string;
    perchHeightM?: number;
    behaviour?: string;
    gravid?: boolean;
    injuries?: string;
    markId?: string;
  };
  notes?: string;
}

export type SurveyRecord = Survey | Encounter;
export type RecordType = 'survey' | 'encounter';

export interface Location {
  /** WGS84, the value finally accepted. */
  lat: number;
  lon: number;
  /** As reported by the GPS. Leave out if unknown; never 0. */
  accuracyM?: number;
  source: 'garmin-gpx' | 'phone-gps' | 'typed';
  /** Exactly what was keyed in, character for character. */
  typed?: { raw: string; format: CoordFormat };
  /** The value before a "did you mean?" fix was accepted. */
  original?: { lat: number; lon: number };
  /** The result of checkCoordinate() at entry. */
  check: CoordCheck;
}

export interface Photo {
  photoId: Uuid;
  /** The encounter. */
  recordId: Uuid;
  role?: 'dorsal' | 'ventral' | 'head' | 'habitat' | 'other';
  /** 'photos/<photoId>.jpg' inside the bundle. */
  file: string;
  takenAt: IsoTime;
  bytes: number;
  sha256: string;
  widthPx: number;
  heightPx: number;
}

// ---------- also sent phone → HQ (§5) ----------

export interface ProvisionalTaxon {
  provisionalTaxonId: Uuid;
  proposedName: string;
  rank?: 'species' | 'genus' | 'family' | 'morphospecies';
  notes?: string;
  photoIds?: Uuid[];
  teamId: Code;
  createdBy: Code;
  deviceId: Uuid;
  createdAt: IsoTime;
}

export interface ChangeRequest {
  changeRequestId: Uuid;
  teamId: Code;
  createdBy: Code;
  deviceId: Uuid;
  createdAt: IsoTime;
  templateId: Code;
  coreVersion: number;
  kind: 'promote-team-field' | 'change-core-field' | 'new-field' | 'other';
  fieldKey?: string;
  /** Plain words: "Add 'perch height (m)' to the core form". */
  proposal: string;
  reason?: string;
}

export interface CorrectionResponse {
  correctionId: Uuid;
  decision: 'accepted' | 'declined';
  /** The record's rev after accepting. */
  newRev?: number;
  note?: string;
  by: Code;
  at: IsoTime;
}

// ---------- feedback, made by HQ (§6) ----------

/** "HQ has this." */
export interface Receipt {
  recordType: RecordType;
  id: Uuid;
  rev: number;
  receivedAt: IsoTime;
}

export type ReviewStatus = 'received' | 'flagged' | 'edited' | 'approved' | 'rejected';

export interface Review {
  recordType: RecordType;
  id: Uuid;
  rev: number;
  status: ReviewStatus;
  note?: string;
  by: Code;
  at: IsoTime;
}

export interface CorrectionRequest {
  correctionId: Uuid;
  recordType: RecordType;
  recordId: Uuid;
  /** The rev it refers to. */
  rev: number;
  /** e.g. 'location', 'svl'. */
  fieldPath: string;
  current: unknown;
  proposed: unknown;
  /** Plain words. */
  reason: string;
  source: 'ai-agent' | 'data-manager';
  /** A person ALWAYS approves before it is sent, even if the AI drafted it. */
  approvedBy: Code;
  createdAt: IsoTime;
}

export interface TaxonDecision {
  provisionalTaxonId: Uuid;
  decision: 'approved' | 'mapped' | 'rejected';
  taxonId?: string;
  note?: string;
  by: Code;
  at: IsoTime;
}

export interface ChangeRequestDecision {
  changeRequestId: Uuid;
  decision: 'accepted' | 'declined';
  inCoreVersion?: number;
  note?: string;
  by: Code;
  at: IsoTime;
}

// ---------- checks (§8) ----------

export type CoordFlag =
  | 'OUTSIDE_PROJECT_BBOX'
  | 'OFF_TRANSECT_AMBER'
  | 'OFF_TRANSECT_RED'
  | 'CHAINAGE_MISMATCH'
  | 'TYPED_DISTANCE_DISAGREES'
  | 'ORDER_REVERSED'
  | 'PRESUMED_NEGATED_LONGITUDE'
  | 'PRESUMED_SWAPPED_COORDINATE'
  | 'POSSIBLE_DATUM_SHIFT'
  | 'ROBUST_OUTLIER';

export type SuggestionKind =
  | 'digit-swap'
  | 'digit-edit'
  | 'negated-lon'
  | 'lat-lon-swap'
  | 'dm-as-dd'
  | 'utm16n'
  | 'utm17n'
  | 'crtm05';

export interface CoordSuggestion {
  kind: SuggestionKind;
  lat: number;
  lon: number;
  offsetM: number;
  chainageM: number;
  /** Plain words: "Swap the 4th and 5th digits of the easting (806152 → 806512)". */
  explain: string;
  /** The corrected typed string, when the fix came from editing what was typed. */
  raw?: string;
}

export type CoordBand = 'green' | 'amber' | 'red' | 'outside-bbox';

export interface CoordCheck {
  checkerVersion: string;
  transectId: Code;
  /** Perpendicular distance from the line (Turf nearestPointOnLine). */
  offsetM: number;
  /** Distance along the line from its start. */
  chainageM: number;
  toleranceM: number;
  band: CoordBand;
  flags: CoordFlag[];
  /** Only when band ≠ green; each candidate re-checked; kept only if ≤ tolerance; best first. */
  suggestions: CoordSuggestion[];
  decision?: {
    kind: 'kept-original' | 'accepted-suggestion' | 're-taken' | 'override';
    suggestionKind?: SuggestionKind;
    /** Required for 'override'. */
    reason?: string;
    by: Code;
    at: IsoTime;
  };
}

export interface KeyCandidate {
  taxonId: string;
  scientificName: string;
  dangerous?: boolean;
  /** 0–1 */
  score: number;
  /** "10 midbody rows (range 10–10)" */
  matched: string[];
  /** "17 rows, but the pack says 19–21" */
  conflicts: string[];
  /** Traits the pack has no data on for this species: NOT a mismatch. */
  unknown: string[];
}

export interface KeyResult {
  keyVersion: string;
  packId: string;
  packVersion: number;
  inputs: ScaleCounts & { sex?: Sex; tailCondition?: TailCondition };
  candidates: KeyCandidate[];
  /** The trait that best splits the remaining candidates. */
  checkNext?: TraitKey;
}

// ---------- bundles (§3) ----------

export interface ManifestEntry {
  path: string;
  bytes: number;
  sha256: string;
  count?: number;
}

export interface Manifest {
  format: 'sciworks-bundle';
  contractVersion: string;
  bundleType: 'field' | 'hq';
  bundleId: Uuid;
  createdAt: IsoTime;
  createdBy: { app: 'field' | 'hq'; appVersion: string; deviceId?: Uuid; personId?: Code };
  projectId: Code;
  /** field: the sending team. hq: the target team. */
  teamId: Code;
  coreVersion: number;
  overlayRev?: number;
  /** Field bundles only. */
  scope?: 'unconfirmed' | 'full';
  contents: ManifestEntry[];
}

/** Everything a Field bundle can carry. All parts optional. */
export interface FieldBundleParts {
  surveys?: Survey[];
  encounters?: Encounter[];
  photos?: Photo[];
  /** Photo bytes keyed by photoId. */
  photoFiles?: Record<Uuid, Uint8Array>;
  overlay?: Overlay;
  provisionalTaxa?: ProvisionalTaxon[];
  changeRequests?: ChangeRequest[];
  correctionResponses?: CorrectionResponse[];
}

/** Everything an HQ bundle can carry. All parts optional. */
export interface HqBundleParts {
  project?: Project;
  template?: Template;
  overlay?: Overlay;
  transects?: TransectCollection;
  speciesPack?: SpeciesPack;
  /** Markdown credits for species data and photos. */
  attribution?: string;
  receipts?: Receipt[];
  reviews?: Review[];
  corrections?: CorrectionRequest[];
  taxonDecisions?: TaxonDecision[];
  changeRequestDecisions?: ChangeRequestDecision[];
  /** Satellite pictures for the team's transects (optional). */
  basemaps?: Basemap[];
  /** Picture bytes by basemapId. Only checksum-verified files are returned on read. */
  basemapFiles?: Record<Code, Uint8Array>;
  /** One small photo per species (optional). */
  speciesPhotos?: SpeciesPhoto[];
  /** Photo bytes by taxonId. Only checksum-verified files are returned on read. */
  speciesPhotoFiles?: Record<string, Uint8Array>;
}
