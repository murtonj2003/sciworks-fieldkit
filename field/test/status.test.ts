// Round 2 (Jack, Sat 18:00): the three upload tiers on every row, and the field notebook's look-alikes.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

process.env.FIELD_TEST_DB = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'status-')), 'field.db');

import { readBundle, type SpeciesPack } from '@sciworks/shared';

import { compareRows, licenceShort, lookAlikes, traitLines } from '@/lib/speciesGuide';

const fixture = (name: string) => new Uint8Array(fs.readFileSync(new URL(`../../shared/fixtures/${name}`, import.meta.url)));

describe('Upload tiers: on phone → sent → HQ', () => {
  it('moves a survey through the three tiers', async () => {
    vi.resetModules();
    const [records, meta, setup, feedback, receive, send, factory, status, db] = await Promise.all([
      import('@/db/records'),
      import('@/db/meta'),
      import('@/db/setup'),
      import('@/db/feedback'),
      import('@/sync/receiveHq'),
      import('@/sync/sendField'),
      import('@/model/factory'),
      import('@/db/status'),
      import('@/db/db'),
    ]);
    db.getDb();
    receive.receiveHqBundle(fixture('HQ_sample.zip'), 'HQ_sample.zip');
    meta.setMeta('personId', 'p-b-2');
    const st = setup.loadSetup('team-b');
    const person = st.project!.people.find((p) => p.personId === 'p-b-2')!;
    const ctx = { project: st.project!, template: st.template!, person, deviceId: meta.deviceId(), overlayRev: 0 };
    const sv = factory.newSurvey(ctx, 'T-LS-02', [person.personId]);
    records.saveDraftNow(sv);
    expect(status.uploadTier(sv.id)).toBe('phone'); // a draft, never sealed
    records.seal(sv.id);
    expect(status.uploadTier(sv.id)).toBe('phone');

    const state = { ...st, deviceId: meta.deviceId(), person, counter: feedback.computeCounter(), basemaps: [], refresh() {}, choosePerson() {} };
    await send.makeFieldBundle(state as never, 'unconfirmed');
    expect(status.uploadTier(sv.id)).toBe('sent');

    // A full backup is not "sent to HQ": a later edit goes back to "on phone" and a backup doesn't change that.
    records.saveDraftNow({ ...sv, notes: 'edited after sending' } as never);
    records.seal(sv.id);
    expect(status.uploadTier(sv.id)).toBe('phone');
    await send.makeFieldBundle(state as never, 'full');
    expect(status.uploadTier(sv.id)).toBe('phone');

    feedback.addReceipts([{ recordType: 'survey', id: sv.id, rev: 2, receivedAt: '2026-10-17T20:00:00-06:00', bundleId: 'test' } as never]);
    expect(status.uploadTier(sv.id)).toBe('hq');
    const counts = status.tierCounts();
    expect(counts.hq).toBeGreaterThanOrEqual(1);
  });
});

describe('Field notebook (real pack data only)', () => {
  const r = readBundle(fixture('HQ_sample.zip'));
  const pack = (r.ok ? r.hq!.speciesPack : null) as SpeciesPack;
  const byName = (n: string) => pack.taxa.find((x) => x.scientificName === n)!;

  it('lists look-alikes from the same genus first', () => {
    const names = lookAlikes(byName('Imantodes cenchoa'), pack).map((x) => x.scientificName);
    expect(names[0]).toBe('Imantodes inornatus');
    expect(names).not.toContain('Imantodes cenchoa');
  });

  it('shows the pack’s own ranges and marks counts that do not overlap', () => {
    const lines = traitLines(byName('Leptodeira ornata'));
    expect(lines.find((l) => l.label === 'Midbody scale rows')?.text).toBe('19–23');
    expect(lines.find((l) => l.label === 'Ventrals')?.text).toBe('170–193 (males)\n169–194 (females)');
    const rows = compareRows(byName('Leptodeira ornata'), byName('Bothrops asper'));
    const mid = rows.find((x) => x.label === 'Midbody scale rows')!;
    expect(mid.a).toBe('19–23');
    expect(typeof mid.differ).toBe('boolean');
  });

  it('names photo licences in plain words', () => {
    expect(licenceShort('http://creativecommons.org/licenses/by/4.0/')).toBe('CC BY 4.0');
    expect(licenceShort('http://creativecommons.org/publicdomain/zero/1.0/')).toBe('CC0');
  });
});
