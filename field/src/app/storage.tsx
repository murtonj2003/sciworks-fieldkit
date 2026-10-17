// Storage check: the torture-test tools (MOBILE-BRIEF §5). Shows what is on the phone, proves every photo's
// SHA-256 still matches, and lets you type into a record and force-quit mid-word.
import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import { useState } from 'react';
import { ScrollView, StyleSheet, TextInput } from 'react-native';

import { Button, Card, H2, P, colors } from '@/components/ui';
import { all, first, run } from '@/db/db';
import { listPhotos, savePhoto, verifyPhotos } from '@/db/photos';
import { getRecord, listRecords, saveDraft, saveDraftNow, seal } from '@/db/records';
import { allSetupVersions } from '@/db/setup';
import { newId } from '@/db/meta';
import { nowIso } from '@/lib/time';
import { newEncounter, newSurvey, touched, type StampContext } from '@/model/factory';
import type { LocalSurvey } from '@/model/records';
import { useField } from '@/state/field';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const TEST_JPEG = require('../../../shared/scripts/assets/photo-dorsal.jpg');
const TEST_NOTE_PREFIX = 'Torture test';

function stats() {
  const n = (sql: string) => first<{ n: number }>(sql)?.n ?? 0;
  return {
    revs: n('SELECT COUNT(*) AS n FROM record_revs'),
    records: n('SELECT COUNT(DISTINCT id) AS n FROM record_revs'),
    unsealed: n('SELECT COUNT(*) AS n FROM drafts WHERE dirty = 1'),
    photos: n('SELECT COUNT(*) AS n FROM photos'),
    receipts: n('SELECT COUNT(*) AS n FROM receipts'),
    bundlesIn: n('SELECT COUNT(*) AS n FROM bundles_in'),
    bundlesOut: n('SELECT COUNT(*) AS n FROM bundles_out'),
    templates: allSetupVersions('template'),
  };
}

function testSurvey(): LocalSurvey | null {
  return listRecords<LocalSurvey>('survey').find((s) => s.notes?.startsWith(TEST_NOTE_PREFIX)) ?? null;
}

export default function Storage() {
  const field = useField();
  const [s, setS] = useState(stats);
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [survey, setSurvey] = useState<LocalSurvey | null>(testSurvey);
  const say = (line: string) => setLog((l) => [line, ...l]);
  const refresh = () => {
    setS(stats());
    field.refresh();
  };

  const ctx: StampContext | null =
    field.project && field.template && field.person
      ? {
          project: field.project,
          template: field.template,
          person: field.person,
          deviceId: field.deviceId,
          overlayRev: field.overlay?.overlayRev ?? 0,
        }
      : null;

  async function create30() {
    if (!ctx) return say('Load the demo project and choose a person first.');
    setBusy(true);
    try {
      const asset = Asset.fromModule(TEST_JPEG);
      await asset.downloadAsync();
      const jpeg = await new File(asset.localUri ?? asset.uri).bytes();
      const team = ctx.project.teams.find((t) => t.teamId === ctx.person.teamId);
      const transectId = team?.transectIds[0] ?? 'T-LS-02';
      const sv = newSurvey(ctx, transectId, [ctx.person.personId]);
      sv.notes = `${TEST_NOTE_PREFIX} survey. Type below, then force-quit.`;
      saveDraftNow(sv);
      seal(sv.id);
      for (let i = 1; i <= 29; i++) {
        const e = newEncounter(ctx, sv);
        const photoId = newId();
        savePhoto({
          photoId,
          recordId: e.id,
          bytes: jpeg,
          widthPx: asset.width ?? 0,
          heightPx: asset.height ?? 0,
          takenAt: nowIso(ctx.project.timeZone),
          role: 'dorsal',
        });
        saveDraftNow({ ...e, photoIds: [photoId], notes: `${TEST_NOTE_PREFIX} animal ${i}` });
        seal(e.id);
      }
      setSurvey(getRecord<LocalSurvey>(sv.id));
      say('Created 1 survey + 29 animals, each animal with a photo.');
    } catch (e) {
      say(`Failed: ${String(e)}`);
    } finally {
      setBusy(false);
      refresh();
    }
  }

  async function checkPhotos() {
    setBusy(true);
    const r = await verifyPhotos();
    setBusy(false);
    say(
      r.ok === r.total
        ? `✓ All ${r.total} photos present; every SHA-256 matches.`
        : `✗ ${r.missing.length} missing, ${r.mismatched.length} changed, of ${r.total}.`,
    );
  }

  function tryDelete() {
    if ((first<{ n: number }>('SELECT COUNT(*) AS n FROM record_revs')?.n ?? 0) === 0) {
      say('No records on this phone yet, so there is nothing to try deleting. Make a record first.');
      return;
    }
    try {
      const changed = run('DELETE FROM record_revs WHERE rowid = (SELECT MIN(rowid) FROM record_revs)');
      say(changed > 0 ? '✗ A record was deleted. This should never happen.' : 'Nothing was deleted.');
    } catch (e) {
      say(`✓ The database refused to delete: ${String((e as Error).message ?? e).replace(/^.*?: /, '')}`);
    }
    refresh();
  }

  function typeNote(text: string) {
    if (!survey) return;
    const next = touched({ ...survey, notes: text }, field.project?.timeZone);
    setSurvey(next);
    saveDraft(next);
  }

  const revs = survey ? all<{ rev: number }>('SELECT rev FROM record_revs WHERE id = ?', [survey.id]).length : 0;

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <Card>
        <H2>On this phone</H2>
        <P>
          {s.records} records ({s.revs} saved versions) · {s.photos} photos · {s.unsealed} being edited
        </P>
        <P dim>
          {s.receipts} HQ receipts · {s.bundlesIn} bundles received · {s.bundlesOut} sent · form versions kept:{' '}
          {s.templates.join(', ') || 'none'}
        </P>
        <P dim>Device {field.deviceId}</P>
        <P dim>{listPhotos().length} photo files in the app's documents folder</P>
      </Card>

      <Button label="Check every photo (SHA-256)" onPress={checkPhotos} disabled={busy} />
      <Button label="Try to delete a record" kind="secondary" onPress={tryDelete} />

      <Card>
        <H2>Torture test</H2>
        <P dim>
          1. Create 30 records. 2. Type in the box. 3. Force-quit mid-word. 4. Reboot. 5. Reopen: the text, every record and
          every photo are still here.
        </P>
        <Button label={busy ? 'Working…' : 'Create 30 test records with photos'} onPress={create30} disabled={busy || !ctx} />
        {survey && (
          <>
            <P dim>Saved on every keystroke ({revs} sealed versions so far):</P>
            <TextInput
              style={styles.input}
              multiline
              value={survey.notes ?? ''}
              onChangeText={typeNote}
              onBlur={() => {
                seal(survey.id);
                refresh();
              }}
            />
          </>
        )}
      </Card>

      {log.map((l, i) => (
        <P key={`${i}-${l}`}>{l}</P>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 12, paddingBottom: 64 },
  input: {
    minHeight: 96,
    borderWidth: 2,
    borderColor: colors.line,
    borderRadius: 10,
    padding: 12,
    fontSize: 18,
    color: colors.ink,
    textAlignVertical: 'top',
  },
});
