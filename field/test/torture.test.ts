// The torture test (MOBILE-BRIEF §5), run on Node: 30 records with photos → kill mid-typing → "reboot" →
// a new form version from HQ (handshake H5) → switch person. Pass: every record and photo is still there,
// every SHA-256 matches, and the counter is right. (The same test is repeated by hand on the Android phone.)
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

process.env.FIELD_TEST_DB = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'torture-')), 'field.db');

import { writeBundle, type Template } from '@sciworks/shared';

const fixture = (name: string) => new Uint8Array(fs.readFileSync(new URL(`../../shared/fixtures/${name}`, import.meta.url)));
const JPEG = new Uint8Array(fs.readFileSync(new URL('../../shared/scripts/assets/photo-dorsal.jpg', import.meta.url)));
const TEMPLATE_V1 = JSON.parse(fs.readFileSync(new URL('../../demo-data/template.json', import.meta.url), 'utf8')) as Template;

async function startApp() {
  vi.resetModules();
  const [records, meta, setup, feedback, photos, receive, factory, form] = await Promise.all([
    import('@/db/records'),
    import('@/db/meta'),
    import('@/db/setup'),
    import('@/db/feedback'),
    import('@/db/photos'),
    import('@/sync/receiveHq'),
    import('@/model/factory'),
    import('@/model/form'),
  ]);
  const recovered = records.sealAll();
  const state = () => {
    const project = setup.loadSetup(null).project;
    const person = project?.people.find((p) => p.personId === meta.getMeta('personId')) ?? null;
    return { ...setup.loadSetup(person?.teamId ?? null), deviceId: meta.deviceId(), person };
  };
  return { records, meta, setup, feedback, photos, receive, factory, form, recovered, state };
}

describe('Torture test', () => {
  const ids: string[] = [];
  const photoIds: string[] = [];
  let typingId = '';

  it('1. creates 30 records with photos', async () => {
    const app = await startApp();
    app.receive.receiveHqBundle(fixture('HQ_sample.zip'), 'HQ_sample.zip');
    app.meta.setMeta('personId', 'p-b-1');
    const s = app.state();
    const ctx = { project: s.project!, template: s.template!, person: s.person!, deviceId: s.deviceId, overlayRev: s.overlay?.overlayRev ?? 0 };
    const survey = app.factory.newSurvey(ctx, 'T-LS-02', ['p-b-1']);
    app.records.saveDraftNow(survey);
    app.records.seal(survey.id);
    ids.push(survey.id);
    for (let i = 1; i <= 29; i++) {
      const e = app.factory.newEncounter(ctx, survey);
      const photoId = app.meta.newId();
      const bytes = new Uint8Array([...JPEG, i]); // a different file each time, so every SHA-256 differs
      app.photos.savePhoto({ photoId, recordId: e.id, bytes, widthPx: 8, heightPx: 8, takenAt: e.observedAt });
      app.records.saveDraftNow({ ...e, photoIds: [photoId], notes: `animal ${i}` });
      app.records.seal(e.id);
      ids.push(e.id);
      photoIds.push(photoId);
    }
    expect(app.feedback.computeCounter()).toMatchObject({ totalRecords: 30, totalPhotos: 29, recordsNotWithHq: 30, photosNotWithHq: 29 });
  });

  it('2. force-kill mid-typing: the app goes to the background (drafts flushed) and is killed before sealing', async () => {
    const app = await startApp();
    typingId = ids[29]!;
    const e = app.records.getRecord(typingId)!;
    for (const text of ['S', 'Sn', 'Sna', 'Snake under a lo']) app.records.saveDraft({ ...e, notes: text });
    const { sendAppState } = await import('../test/shims/misc');
    sendAppState('background'); // the phone leaves the app: the real AppState hook flushes; then the process dies
  });

  it('3. "reboot": the half-typed note is recovered and sealed; nothing else changed', async () => {
    const app = await startApp();
    expect(app.recovered).toBe(1);
    expect((app.records.getSealed(typingId) as { notes?: string }).notes).toBe('Snake under a lo');
    expect(app.records.history(typingId).map((r) => r.rev)).toEqual([1, 2]);
  });

  it('4. a new form version from HQ (H5): old records intact, new records stamped v2, team changes still apply', async () => {
    const app = await startApp();
    const v2: Template = {
      ...TEMPLATE_V1,
      coreVersion: 2,
      publishedAt: '2026-10-17T20:00:00-06:00',
      fields: [
        ...TEMPLATE_V1.fields,
        { key: 'extras.canopyCoverPct', path: 'extras.canopyCoverPct', recordType: 'encounter', label: 'Canopy cover', type: 'number', unit: 'pct', tier: 'team', group: 'extras', order: 46, hidden: true, teamCan: ['show-hide'], addedInCore: 2 },
      ],
    };
    const at = '2026-10-17T20:05:00-06:00';
    const hq = writeBundle({
      bundleType: 'hq',
      bundleId: app.meta.newId(),
      createdAt: at,
      createdBy: { app: 'hq', appVersion: 'test' },
      projectId: 'cr-herps',
      teamId: 'team-b',
      coreVersion: 2,
      parts: { template: v2 },
    });
    const r = app.receive.receiveHqBundle(hq, 'HQ_core2.zip');
    expect(r.changes.join('\n')).toMatch(/version 2/);
    expect(app.setup.allSetupVersions('template')).toEqual([1, 2]); // every version kept
    const s = app.state();
    expect(s.template?.coreVersion).toBe(2);

    for (const id of ids) {
      const rec = app.records.getSealed(id);
      expect(rec?.coreVersion).toBe(1); // made with v1, still v1, still readable
    }
    const fields = app.form.effectiveFields(s.template!, s.overlay, 'encounter');
    expect(fields.find((f) => f.key === 'extras.canopyCoverPct')?.hidden).toBe(true);
    expect(fields.find((f) => f.key === 'perchHeightM')).toBeTruthy(); // Team B's added field (overlay rev 2) still applies
    expect(fields.find((f) => f.key === 'extras.microhabitat')?.hidden).toBe(false); // and its show-hide change

    const ctx = { project: s.project!, template: s.template!, person: s.person!, deviceId: s.deviceId, overlayRev: s.overlay?.overlayRev ?? 0 };
    const survey = app.records.getRecord(ids[0]!) as Parameters<typeof app.factory.newEncounter>[1];
    const fresh = app.factory.newEncounter(ctx, survey);
    expect(fresh.coreVersion).toBe(2);
    expect(fresh.overlayRev).toBe(2);
  });

  it('5. switch person, then check everything: 30 records, 29 photos, every SHA-256 matches, counter right', async () => {
    const app = await startApp();
    app.meta.setMeta('personId', 'p-b-2');
    expect(app.state().person?.name).toBe('Tom Reid');

    for (const id of ids) expect(app.records.getSealed(id)).not.toBeNull();
    const check = await app.photos.verifyPhotos();
    expect(check).toEqual({ total: 29, ok: 29, missing: [], mismatched: [] });
    expect(app.photos.listPhotos().map((p) => p.photoId).sort()).toEqual([...photoIds].sort());
    expect(app.feedback.computeCounter()).toMatchObject({ totalRecords: 30, totalPhotos: 29, recordsNotWithHq: 30, photosNotWithHq: 29 });
    // Records keep who made them; switching person never rewrites them.
    expect(app.records.getSealed(ids[1]!)?.createdBy).toBe('p-b-1');
  });
});
