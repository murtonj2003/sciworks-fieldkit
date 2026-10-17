// Live handshake without a phone: the Field app's real bundle code → the HQ app's real import code, and back.
// HQ's modules are only imported (read-only); nothing in hq/ is changed. SHARED-CONTRACT §9: H1, H2, H3, H4.
import 'fake-indexeddb/auto';

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

process.env.FIELD_TEST_DB = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'handshake-')), 'field.db');

import { checkCoordinate, parseTyped, type Transect } from '@sciworks/shared';

import { HqDb, recordKey } from '../../hq/src/db';
import { makeHqBundle } from '../../hq/src/lib/hqBundle';
import { importBundleFile } from '../../hq/src/lib/importBundle';
import { approveDraft, createCorrection, setStatus } from '../../hq/src/lib/review';

const fixture = (name: string) => new Uint8Array(fs.readFileSync(new URL(`../../shared/fixtures/${name}`, import.meta.url)));
const JPEG = new Uint8Array(fs.readFileSync(new URL('../../shared/scripts/assets/photo-dorsal.jpg', import.meta.url)));
const readOut = (uri: string) => new Uint8Array(fs.readFileSync(uri.replace('file://', '')));

async function phone() {
  vi.resetModules();
  const [records, meta, setup, feedback, photos, receive, send, factory, form] = await Promise.all([
    import('@/db/records'),
    import('@/db/meta'),
    import('@/db/setup'),
    import('@/db/feedback'),
    import('@/db/photos'),
    import('@/sync/receiveHq'),
    import('@/sync/sendField'),
    import('@/model/factory'),
    import('@/model/form'),
  ]);
  records.sealAll();
  const state = () => {
    const project = setup.loadSetup(null).project;
    const person = project?.people.find((p) => p.personId === meta.getMeta('personId')) ?? null;
    return { ...setup.loadSetup(person?.teamId ?? null), deviceId: meta.deviceId(), person, counter: feedback.computeCounter(), refresh() {}, choosePerson() {} };
  };
  return { records, meta, feedback, photos, receive, send, factory, form, state };
}

describe('Handshake: Field app ⇄ HQ app (real code on both sides)', () => {
  const hq = new HqDb(`handshake-${Date.now()}`);
  const ids: { survey: string; animal: string } = { survey: '', animal: '' };

  it('H1: a phone bundle imports into HQ with matching counts', async () => {
    const p = await phone();
    expect(p.receive.receiveHqBundle(fixture('HQ_sample.zip'), 'HQ_sample.zip').ok).toBe(true);
    expect((await importBundleFile(fixture('HQ_sample.zip'), 'HQ_sample.zip', hq)).ok).toBe(true);

    p.meta.setMeta('personId', 'p-b-1');
    const s = p.state();
    const ctx = { project: s.project!, template: s.template!, person: s.person!, deviceId: s.deviceId, overlayRev: 0 };
    const survey = p.form.withDefaults(p.factory.newSurvey(ctx, 'T-LS-02', ['p-b-1', 'p-b-2']), p.form.effectiveFields(s.template!, null, 'survey'));
    survey.weatherStart = { ...survey.weatherStart, cloud: 'cannot-assess', rainNow: 'none', windBeaufort: 0, airTempC: 24.5 };
    p.records.saveDraftNow(survey);
    p.records.seal(survey.id);
    ids.survey = survey.id;

    const t2 = s.transects!.features.find((f) => f.properties.transectId === 'T-LS-02') as Transect;
    const raw = '16P 825749 1151370';
    const typed = parseTyped(raw, 'utm16n') as { lat: number; lon: number };
    const check = checkCoordinate({ ...typed, typed: { raw, format: 'utm16n' } }, t2, s.project!);
    const fix = check.suggestions[0]!;
    const e = p.form.withDefaults(p.factory.newEncounter(ctx, survey), p.form.effectiveFields(s.template!, null, 'encounter'));
    const photoId = p.meta.newId();
    p.photos.savePhoto({ photoId, recordId: e.id, bytes: JPEG, widthPx: 8, heightPx: 8, takenAt: e.observedAt });
    p.records.saveDraftNow({
      ...e,
      taxon: { taxonId: s.pack!.taxa[0]!.taxonId, scientificName: s.pack!.taxa[0]!.scientificName, idBasis: 'in-hand' },
      svl: { value: 435, unit: 'mm', method: 'squeeze-box' },
      photoIds: [photoId],
      location: {
        lat: fix.lat,
        lon: fix.lon,
        source: 'typed',
        typed: { raw, format: 'utm16n' },
        original: typed,
        check: { ...check, decision: { kind: 'accepted-suggestion', suggestionKind: fix.kind, by: 'p-b-1', at: e.observedAt } },
      },
      distanceAlongM: { value: Math.round(fix.chainageM), source: 'auto' },
    });
    p.records.seal(e.id);
    ids.animal = e.id;
    // A second animal, saved before its coordinate was typed: HQ must hold it aside, not drop it.
    const unfinished = p.factory.newEncounter(ctx, survey);
    p.records.saveDraftNow({ ...unfinished, notes: 'Coordinate still to type' });
    p.records.seal(unfinished.id);

    const made = await p.send.makeFieldBundle(s, 'unconfirmed');
    expect(made.counts).toMatchObject({ surveys: 1, encounters: 2, photos: 1 });
    const summary = await importBundleFile(readOut(made.uri), made.fileName, hq);
    expect(summary.ok).toBe(true);
    expect(summary.newRecords).toBe(2); // the survey + the complete animal
    expect(summary.newPhotos).toBe(1);
    expect(JSON.stringify(summary)).toMatch(/held|rejected|incomplete/i);

    const row = await hq.records.get(recordKey('encounter', e.id));
    expect(row).toBeTruthy();
    fs.writeFileSync(path.join(os.tmpdir(), 'H1-summary.json'), JSON.stringify(summary, null, 2));
  });

  it('H2: importing the same file again changes nothing', async () => {
    const p = await phone();
    const before = { records: await hq.records.count(), revisions: await hq.revisions.count(), photos: await hq.photos.count() };
    const made = p.send.listBundlesOut()[0]!;
    const file = path.join(process.env.FIELD_TEST_FS!, 'document', 'bundles-out', made.fileName);
    const again = await importBundleFile(new Uint8Array(fs.readFileSync(file)), made.fileName, hq);
    expect(again.newRecords).toBe(0);
    expect(again.updatedRecords).toBe(0);
    expect({ records: await hq.records.count(), revisions: await hq.revisions.count(), photos: await hq.photos.count() }).toEqual(before);
  });

  it('H4: HQ approves → HQ bundle → the phone counter drops to the unfinished record only', async () => {
    await setStatus(recordKey('encounter', ids.animal), 'approved', { by: 'p-dm' }, hq);
    await setStatus(recordKey('survey', ids.survey), 'approved', { by: 'p-dm' }, hq);
    const back = await makeHqBundle('team-b', {}, hq);
    expect(back.counts.receipts).toBeGreaterThanOrEqual(2);

    const p = await phone();
    const r = p.receive.receiveHqBundle(back.bytes, back.fileName);
    expect(r.ok).toBe(true);
    const c = p.state().counter;
    expect(c.photosNotWithHq).toBe(0);
    expect(c.recordsNotWithHq).toBe(1); // only the animal still missing its coordinate
    expect(p.feedback.latestReview(ids.animal)?.status).toBe('approved');
  });

  it('H3: an edit after approval reaches HQ as "edited" with history kept', async () => {
    const p = await phone();
    const e = p.records.getRecord(ids.animal)!;
    p.records.saveDraftNow({ ...e, notes: 'Re-measured at camp' });
    expect(p.records.seal(ids.animal)).toBe(2);
    const made = await p.send.makeFieldBundle(p.state(), 'unconfirmed');
    const summary = await importBundleFile(readOut(made.uri), made.fileName, hq);
    expect(summary.updatedRecords).toBe(1);
    expect(summary.editedAfterReview).toBe(1);
    const row = await hq.records.get(recordKey('encounter', ids.animal));
    expect(JSON.stringify(row)).toMatch(/edited/);
  });
  it('F8: an AI-drafted, Data-Manager-approved fix arrives, is accepted on the phone, and HQ gets the answer', async () => {
    const draft = await createCorrection(
      { key: recordKey('encounter', ids.animal), fieldPath: 'svl', proposed: { value: 43.5, unit: 'mm', method: 'squeeze-box' }, reason: 'Test: decimal point', by: 'ai', source: 'ai-agent', asDraft: true },
      hq,
    );
    await approveDraft(draft.correctionId, 'p-dm', {}, hq);
    const back = await makeHqBundle('team-b', {}, hq);
    expect(back.counts.corrections).toBe(1);

    const p = await phone();
    p.receive.receiveHqBundle(back.bytes, back.fileName);
    const corrections = await import('@/sync/corrections');
    expect(corrections.pendingCount()).toBe(1);
    const item = corrections.inbox().find((i) => i.request.correctionId === draft.correctionId)!;
    expect(item.request.approvedBy).toBe('p-dm');
    const newRev = corrections.acceptCorrection(item, { personId: 'p-b-1', at: '2026-10-17T22:00:00-06:00', project: p.state().project, transects: p.state().transects });
    expect(newRev).toBe(3);
    expect((p.records.getSealed(ids.animal) as { svl: { value: number } }).svl.value).toBe(43.5);
    expect(p.records.history(ids.animal).map((r) => r.rev)).toEqual([1, 2, 3]); // nothing overwritten
    expect(corrections.pendingCount()).toBe(0);

    const made = await p.send.makeFieldBundle(p.state(), 'unconfirmed');
    const summary = await importBundleFile(readOut(made.uri), made.fileName, hq);
    expect(summary.newCorrectionResponses).toBe(1);
    expect(summary.updatedRecords).toBe(1);
  });
});
