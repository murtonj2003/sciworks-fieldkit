// Jack, Sat 17:40: "every time I press Add animal, the record count goes up whether I save it or not".
// A new animal is now a fresh draft: left empty (Back, Done, a crash) it is dropped and never counted;
// once anything is entered it is kept and sealed like any other record.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

process.env.FIELD_TEST_DB = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'fresh-')), 'field.db');

const fixture = (name: string) => new Uint8Array(fs.readFileSync(new URL(`../../shared/fixtures/${name}`, import.meta.url)));

async function startApp() {
  vi.resetModules();
  const [records, meta, setup, feedback, receive, factory, db] = await Promise.all([
    import('@/db/records'),
    import('@/db/meta'),
    import('@/db/setup'),
    import('@/db/feedback'),
    import('@/sync/receiveHq'),
    import('@/model/factory'),
    import('@/db/db'),
  ]);
  db.getDb();
  const recovered = records.sealAll();
  return { records, meta, setup, feedback, receive, factory, recovered };
}

describe('Add animal: an empty new animal is never counted', () => {
  let surveyId = '';
  let crashedId = '';

  it('Back from an empty new animal: no record, the counter does not move', async () => {
    const app = await startApp();
    app.receive.receiveHqBundle(fixture('HQ_sample.zip'), 'HQ_sample.zip');
    app.meta.setMeta('personId', 'p-b-2');
    const project = app.setup.loadSetup(null).project!;
    const template = app.setup.loadSetup(null).template!;
    const person = project.people.find((p) => p.personId === 'p-b-2')!;
    const ctx = { project, template, person, deviceId: app.meta.deviceId(), overlayRev: 0 };
    const survey = app.factory.newSurvey(ctx, 'T-LS-02', [person.personId]);
    surveyId = survey.id;
    app.records.saveDraftNow(survey);
    app.records.seal(survey.id);
    const before = app.feedback.computeCounter().recordsNotWithHq;

    for (let i = 0; i < 3; i++) {
      const e = app.factory.newEncounter(ctx, survey);
      app.records.createFreshDraft(e);
      expect(app.records.isFresh(e.id)).toBe(true);
      expect(app.records.sealOrDiscard(e.id)).toBeNull(); // the Animal screen closing with nothing entered
      expect(app.records.getRecord(e.id)).toBeNull();
    }
    expect(app.feedback.computeCounter().recordsNotWithHq).toBe(before);
    expect(app.records.listRecords('encounter').filter((x) => (x as { surveyId?: string }).surveyId === surveyId)).toHaveLength(0);
  });

  it('an animal with something entered is kept and sealed', async () => {
    const app = await startApp();
    const survey = app.records.getRecord(surveyId)!;
    const project = app.setup.loadSetup(null).project!;
    const template = app.setup.loadSetup(null).template!;
    const person = project.people.find((p) => p.personId === 'p-b-2')!;
    const ctx = { project, template, person, deviceId: app.meta.deviceId(), overlayRev: 0 };
    const before = app.feedback.computeCounter().recordsNotWithHq;
    const e = app.factory.newEncounter(ctx, survey as never);
    app.records.createFreshDraft(e);
    app.records.clearFresh(e.id); // the first tap (what useRecord.update does)
    app.records.saveDraftNow({ ...e, sex: 'female' } as never);
    expect(app.records.sealOrDiscard(e.id)).toBe(1);
    expect(app.feedback.computeCounter().recordsNotWithHq).toBe(before + 1);

    // A fresh one left open when the app is killed...
    const crashed = app.factory.newEncounter(ctx, survey as never);
    crashedId = crashed.id;
    app.records.createFreshDraft(crashed);
  });

  it('...is dropped on the next start, not "recovered"', async () => {
    const app = await startApp();
    expect(app.recovered).toBe(0);
    expect(app.records.getRecord(crashedId)).toBeNull();
    expect(app.records.isFresh(crashedId)).toBe(false);
  });
});
