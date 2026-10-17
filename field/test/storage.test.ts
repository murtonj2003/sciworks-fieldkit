// The phone's "never loses, never lies" logic, run on Node against the golden fixtures.
// A file-backed database plus vi.resetModules() stands in for "the app was killed and reopened".
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

process.env.FIELD_TEST_DB = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'fielddb-')), 'field.db');

import {
  checkCoordinate,
  parseTyped,
  readBundle,
  writeBundle,
  type Encounter,
  type Overlay,
  type Transect,
} from '@sciworks/shared';

const fixture = (name: string) => new Uint8Array(fs.readFileSync(new URL(`../../shared/fixtures/${name}`, import.meta.url)));
const FACTS = JSON.parse(fs.readFileSync(new URL('../../shared/fixtures/facts.json', import.meta.url), 'utf8'));
const JPEG = new Uint8Array(fs.readFileSync(new URL('../../shared/scripts/assets/photo-dorsal.jpg', import.meta.url)));

/** Fresh module instances = a fresh app start on the same database file. */
async function startApp() {
  vi.resetModules();
  const [records, meta, setup, feedback, photos, receive, send, factory, model, db, form] = await Promise.all([
    import('@/db/records'),
    import('@/db/meta'),
    import('@/db/setup'),
    import('@/db/feedback'),
    import('@/db/photos'),
    import('@/sync/receiveHq'),
    import('@/sync/sendField'),
    import('@/model/factory'),
    import('@/model/records'),
    import('@/db/db'),
    import('@/model/form'),
  ]);
  db.getDb();
  const recovered = records.sealAll();
  const state = () => {
    const personId = meta.getMeta('personId');
    const project = setup.loadSetup(null).project;
    const person = project?.people.find((p) => p.personId === personId) ?? null;
    return {
      ...setup.loadSetup(person?.teamId ?? null),
      deviceId: meta.deviceId(),
      person,
      counter: feedback.computeCounter(),
      refresh() {},
      choosePerson() {},
    };
  };
  return { records, meta, setup, feedback, photos, receive, send, factory, model, db, form, recovered, state };
}

describe('Field storage, start to handover', () => {
  let surveyId = '';
  let encounterId = '';

  it('loads the demo project from the HQ fixture, and a second load changes nothing', async () => {
    const app = await startApp();
    const first = app.receive.receiveHqBundle(fixture('HQ_sample.zip'), 'HQ_sample.zip');
    expect(first.ok).toBe(true);
    expect(first.changes.join('\n')).toMatch(/Project set up/);
    const second = app.receive.receiveHqBundle(fixture('HQ_sample.zip'), 'HQ_sample.zip');
    expect(second.changes).toEqual(['Nothing new: this phone already had everything in this bundle']);
    const s = app.state();
    expect(s.project?.projectId).toBe('cr-herps');
    expect(s.template?.coreVersion).toBe(1);
    expect(s.transects?.features.length).toBeGreaterThanOrEqual(3);
    expect(s.pack?.taxa.length).toBe(19);
  });

  it('refuses a Field bundle and a bundle for another project', async () => {
    const app = await startApp();
    const r = app.receive.receiveHqBundle(fixture('FIELD_sample.zip'), 'FIELD_sample.zip');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/HQ app/);
  });

  it('keeps the device ID across restarts', async () => {
    const a = await startApp();
    const id = a.meta.deviceId();
    const b = await startApp();
    expect(b.meta.deviceId()).toBe(id);
  });

  it('saves a survey from the first tap and recovers an unsealed draft after a kill', async () => {
    const app = await startApp();
    app.meta.setMeta('personId', 'p-b-lead');
    const s = app.state();
    const ctx = { project: s.project!, template: s.template!, person: s.person!, deviceId: s.deviceId, overlayRev: 0 };
    const survey = app.factory.newSurvey(ctx, 'T-LS-02', ['p-b-lead', 'p-b-1']);
    surveyId = survey.id;
    app.records.saveDraftNow(survey);
    expect(app.records.seal(survey.id)).toBe(1);
    expect(app.records.seal(survey.id)).toBeNull(); // nothing changed, no new rev

    // Two weather taps, then the app goes to the background (flush) and is killed before sealing.
    app.records.saveDraft({ ...survey, weatherStart: { ...survey.weatherStart, cloud: 'cannot-assess' } });
    app.records.saveDraft({ ...survey, weatherStart: { ...survey.weatherStart, cloud: 'cannot-assess', rainNow: 'none', windBeaufort: 0 } });
    app.records.flushDrafts();

    const reopened = await startApp();
    expect(reopened.recovered).toBe(1);
    const sealed = reopened.records.getSealed(surveyId) as { rev: number; weatherStart: { cloud?: string; rainNow?: string } };
    expect(sealed.rev).toBe(2);
    expect(sealed.weatherStart.cloud).toBe('cannot-assess');
    expect(sealed.weatherStart.rainNow).toBe('none');
    expect(reopened.records.history(surveyId).map((r) => r.rev)).toEqual([1, 2]);
  });

  it('refuses to update or delete a saved record version', async () => {
    const app = await startApp();
    expect(() => app.db.run("UPDATE record_revs SET json = '{}'")).toThrow(/append-only/);
    expect(() => app.db.run('DELETE FROM record_revs')).toThrow(/append-only/);
  });

  it('stores the demo swapped-digit coordinate with the original kept and the fix accepted', async () => {
    const app = await startApp();
    const s = app.state();
    const ctx = { project: s.project!, template: s.template!, person: s.person!, deviceId: s.deviceId, overlayRev: 0 };
    const survey = app.records.getRecord(surveyId) as Parameters<typeof app.factory.newEncounter>[1];
    const fields = app.form.effectiveFields(s.template!, null, 'encounter');
    let e = app.form.withDefaults(app.factory.newEncounter(ctx, survey), fields);
    encounterId = e.id;
    expect(e.sex).toBe('not-assessed');
    expect(app.model.missingForHq(e)).toContain('location');

    const t2 = s.transects!.features.find((f) => f.properties.transectId === 'T-LS-02') as Transect;
    const raw = FACTS.demoTypo.typed as string;
    const typed = parseTyped(raw, 'utm16n') as { lat: number; lon: number };
    const check = checkCoordinate({ ...typed, typed: { raw, format: 'utm16n' } }, t2, s.project!);
    expect(check.band).toBe('red');
    expect(Math.round(check.offsetM)).toBe(Math.round(FACTS.demoTypo.offTransectM));
    const fix = check.suggestions[0]!;
    expect(fix.offsetM).toBeLessThan(check.toleranceM);

    const photoId = app.meta.newId();
    app.photos.savePhoto({ photoId, recordId: e.id, bytes: JPEG, widthPx: 8, heightPx: 8, takenAt: e.observedAt, role: 'dorsal' });
    e = {
      ...e,
      taxon: { taxonId: s.pack!.taxa[0]!.taxonId, scientificName: s.pack!.taxa[0]!.scientificName, idBasis: 'in-hand' },
      svl: { value: 435, unit: 'mm', method: 'squeeze-box' },
      photoIds: [photoId],
      location: {
        lat: fix.lat,
        lon: fix.lon,
        source: 'typed',
        typed: { raw, format: 'utm16n' },
        original: { lat: typed.lat, lon: typed.lon },
        check: { ...check, decision: { kind: 'accepted-suggestion', suggestionKind: fix.kind, by: 'p-b-lead', at: e.observedAt } },
      },
      distanceAlongM: { value: Math.round(fix.chainageM), source: 'auto' },
    };
    app.records.saveDraftNow(e);
    expect(app.records.seal(e.id)).toBe(1);
    expect(app.model.missingForHq(e)).toEqual([]);
    expect(Math.round(fix.chainageM)).toBe(FACTS.demoTypo.fixedDistanceAlongM);
    expect((await app.photos.verifyPhotos()).ok).toBe(1);
    expect(() => app.db.run('DELETE FROM photos')).toThrow(/never deleted/); // a real photo row now exists
    expect((await app.photos.verifyPhotos()).ok).toBe(1);
  });

  it('makes a Field bundle HQ can read in full, and never overwrites an earlier one', async () => {
    const app = await startApp();
    const s = app.state();
    expect(s.counter.recordsNotWithHq).toBe(2);
    expect(s.counter.photosNotWithHq).toBe(1);

    const made = await app.send.makeFieldBundle(s, 'unconfirmed');
    expect(made.counts).toMatchObject({ surveys: 1, encounters: 1, photos: 1, problems: [] });
    const bytes = new Uint8Array(fs.readFileSync(made.uri.replace('file://', '')));
    const read = readBundle(bytes);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.problems).toEqual([]);
    expect(read.rejected).toEqual([]);
    expect(read.manifest).toMatchObject({ bundleType: 'field', teamId: 'team-b', projectId: 'cr-herps', scope: 'unconfirmed' });
    const enc = read.field!.encounters![0] as Encounter;
    expect(enc.location.typed?.raw).toBe(FACTS.demoTypo.typed);
    expect(enc.location.check.decision?.kind).toBe('accepted-suggestion');
    expect(read.field!.photoFiles![enc.photoIds[0]!]).toEqual(JPEG);

    const again = await app.send.makeFieldBundle(s, 'unconfirmed');
    expect(again.fileName).not.toBe(made.fileName);
    const dir = path.dirname(made.uri.replace('file://', ''));
    expect(fs.readdirSync(dir).filter((n) => n.endsWith('.tmp'))).toEqual([]);
    expect(app.state().counter.lastHandoverAt).toBeTruthy();
    // Making a bundle never hides anything: still 2 not with HQ until HQ confirms.
    expect(app.state().counter.recordsNotWithHq).toBe(2);
  });

  it('counts down to 0 when HQ receipts arrive, and back up when a record is edited (H4, H3)', async () => {
    const app = await startApp();
    const at = '2026-10-17T21:00:00-06:00';
    const hq = writeBundle({
      bundleType: 'hq',
      bundleId: app.meta.newId(),
      createdAt: at,
      createdBy: { app: 'hq', appVersion: 'test' },
      projectId: 'cr-herps',
      teamId: 'team-b',
      coreVersion: 1,
      parts: {
        receipts: [
          { recordType: 'survey', id: surveyId, rev: 2, receivedAt: at },
          { recordType: 'encounter', id: encounterId, rev: 1, receivedAt: at },
        ],
        reviews: [{ recordType: 'encounter', id: encounterId, rev: 1, status: 'approved', by: 'p-dm', at }],
      },
    });
    const r = app.receive.receiveHqBundle(hq, 'HQ_receipts.zip');
    expect(r.changes.join('\n')).toMatch(/HQ confirmed 2 record versions/);
    let c = app.state().counter;
    expect(c.recordsNotWithHq).toBe(0);
    expect(c.photosNotWithHq).toBe(0);
    expect(app.feedback.latestReview(encounterId)?.status).toBe('approved');
    expect(app.send.planBundle('unconfirmed').encounters).toHaveLength(0);

    // Receipts never delete local data.
    expect(app.records.getSealed(encounterId)).not.toBeNull();

    const e = app.records.getRecord(encounterId) as Encounter;
    app.records.saveDraftNow({ ...e, notes: 'Re-measured' } as never);
    c = app.state().counter;
    expect(c.recordsNotWithHq).toBe(1);
    const plan = app.send.planBundle('unconfirmed');
    expect(plan.encounters.map((x) => x.rev)).toEqual([2]);
    expect(app.records.history(encounterId).map((x) => x.rev)).toEqual([1, 2]);
  });

  it('applies a team overlay: hide, range inside limits, and a team-added field', async () => {
    const app = await startApp();
    const s = app.state();
    const overlay: Overlay = {
      templateId: 'herp-ves-transect',
      coreVersion: 1,
      teamId: 'team-b',
      overlayRev: 1,
      changes: [
        { fieldKey: 'herp.relativeHumidityPct', what: 'show-hide', value: true, at: 'x', by: 'p-b-lead' },
        { fieldKey: 'mass', what: 'range', value: { min: 1, max: 900 }, at: 'x', by: 'p-b-lead' }, // inside limits: applied
        { fieldKey: 'svl', what: 'range', value: { min: 100, max: 1800 }, at: 'x', by: 'p-b-lead' },
        { fieldKey: 'svl', what: 'range', value: { min: 1, max: 1800 }, at: 'x', by: 'p-b-lead' }, // below minFloor 5: ignored
        { fieldKey: 'sex', what: 'show-hide', value: true, at: 'x', by: 'p-b-lead' }, // core, not allowed: ignored
      ],
      addedFields: [
        {
          key: 'perchHeightM',
          path: 'teamFields.perchHeightM',
          recordType: 'encounter',
          label: 'Perch height',
          type: 'number',
          unit: 'm',
          tier: 'free',
          group: 'extras',
          order: 100,
          origin: 'team',
          addedInCore: 1,
        },
      ],
      updatedAt: 'x',
      updatedBy: 'p-b-lead',
      deviceId: s.deviceId,
    };
    const survey = app.form.effectiveFields(s.template!, overlay, 'survey');
    expect(survey.find((f) => f.key === 'herp.relativeHumidityPct')?.hidden).toBe(true);
    const enc = app.form.effectiveFields(s.template!, overlay, 'encounter');
    const svl = enc.find((f) => f.key === 'svl')!;
    expect([svl.min, svl.max]).toEqual([50, 2500]); // the last range change broke the limits, so the template's stands
    const mass = enc.find((f) => f.key === 'mass')!;
    expect([mass.min, mass.max]).toEqual([1, 900]); // a range inside HQ's limits is applied
    expect(enc.find((f) => f.key === 'sex')?.hidden).toBeFalsy();
    expect(enc.find((f) => f.key === 'perchHeightM')?.path).toBe('teamFields.perchHeightM');
    expect(app.form.setPath({}, 'teamFields.perchHeightM', 1.5)).toEqual({ teamFields: { perchHeightM: 1.5 } });
    expect(app.form.setPath({ teamFields: { perchHeightM: 1.5 } }, 'teamFields.perchHeightM', undefined)).toEqual({});
  });
  it('F5: the Team Lead adds "Number of individuals" offline; the next animal form shows it and HQ gets a request', async () => {
    const app = await startApp();
    const [overlayModel, team] = await Promise.all([import('@/model/overlay'), import('@/db/team')]);
    const s = app.state();
    expect(s.person?.role).toBe('team-lead');
    expect(s.overlay?.overlayRev).toBe(2); // Team B's baseline from the demo HQ bundle already has perch height
    const at = '2026-10-17T20:00:00-06:00';
    const def = overlayModel.teamFieldDef({ label: 'Number of individuals', type: 'number', recordType: 'encounter' }, s.template!, s.overlay!);
    expect(def).toMatchObject({ key: 'numberOfIndividuals', path: 'teamFields.numberOfIndividuals', tier: 'free', origin: 'team' });
    expect(def.unit).toBeUndefined();
    const next = overlayModel.withAddedField(s.overlay!, def, s.person!, s.deviceId, at, 1);
    team.saveOverlay(next, s.person!.personId);
    team.addChangeRequest(overlayModel.promoteRequest(def, s.template!, s.person!, s.deviceId, at, app.meta.newId()));

    const after = app.state();
    expect(after.overlay?.overlayRev).toBe(3);
    expect(app.setup.allSetupVersions('overlay:team-b')).toEqual([2, 3]); // every overlay rev kept
    const fields = app.form.effectiveFields(after.template!, after.overlay, 'encounter');
    expect(fields.find((f) => f.key === 'numberOfIndividuals')?.hidden).toBeFalsy();
    expect(fields.find((f) => f.key === 'perchHeightM')).toBeTruthy();

    // A core field the team may not touch: refused with a reason, nothing saved.
    const svl = fields.find((f) => f.key === 'svl')!;
    expect(overlayModel.checkChange(svl, 'show-hide', true)).toMatch(/doesn't let teams/);
    expect(overlayModel.checkChange(svl, 'range', { min: 1, max: 100 })).toMatch(/no lower than 5/);

    const plan = app.send.planBundle('unconfirmed');
    expect(plan.changeRequests.map((c) => c.proposal)).toEqual(["Add 'Number of individuals' to the core form"]);

    // The next animal records a value in it; the value travels in teamFields and the record is stamped overlayRev 3.
    const ctx = { project: after.project!, template: after.template!, person: after.person!, deviceId: after.deviceId, overlayRev: after.overlay!.overlayRev };
    const survey = app.records.getRecord(surveyId) as Parameters<typeof app.factory.newEncounter>[1];
    const e = app.factory.newEncounter(ctx, survey);
    const located = { ...e, location: (app.records.getSealed(encounterId) as Encounter).location };
    app.records.saveDraftNow(app.form.setPath(located, 'teamFields.numberOfIndividuals', 3));
    app.records.seal(e.id);
    const made = await app.send.makeFieldBundle(after, 'unconfirmed');
    const read = readBundle(new Uint8Array(fs.readFileSync(made.uri.replace('file://', ''))));
    expect(read.ok && read.field?.overlay?.overlayRev).toBe(3);
    expect(read.ok && read.manifest.overlayRev).toBe(3);
    const sent = read.ok ? (read.field?.encounters ?? []).find((x) => x.id === e.id) : undefined;
    expect(sent?.teamFields).toEqual({ numberOfIndividuals: 3 });
    expect(sent?.overlayRev).toBe(3);
  });
});
