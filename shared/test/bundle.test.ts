import { readFileSync } from 'node:fs';
import { strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { CONTRACT_VERSION, bundleFileName, readBundle, sha256Hex } from '../src/index';
import { IDS, buildFieldBundle, buildHqBundle, encounters, photos } from '../scripts/make-fixtures';

const rezip = (files: Record<string, Uint8Array>) => zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, v])));

describe('bundles', () => {
  it('a Field bundle round-trips exactly, photos included', () => {
    const r = readBundle(buildFieldBundle());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.problems).toEqual([]);
    expect(r.manifest.bundleType).toBe('field');
    expect(r.manifest.contractVersion).toBe(CONTRACT_VERSION);
    expect(r.field?.surveys).toHaveLength(1);
    expect(r.field?.encounters?.map((e) => [e.id, e.rev])).toEqual(encounters.map((e) => [e.id, e.rev]));
    expect(r.field?.overlay?.addedFields[0]?.key).toBe('perchHeightM');
    for (const p of photos) expect(sha256Hex(r.field!.photoFiles![p.photoId]!)).toBe(p.sha256);
  });

  it('an HQ bundle round-trips: set-up and feedback', () => {
    const r = readBundle(buildHqBundle());
    expect(r.ok && r.problems).toEqual([]);
    if (!r.ok) return;
    expect(r.hq?.template?.coreVersion).toBe(1);
    expect(r.hq?.transects?.features).toHaveLength(3);
    expect(r.hq?.speciesPack?.taxa.length).toBeGreaterThan(10);
    expect(r.hq?.receipts).toHaveLength(4);
    expect(r.hq?.corrections?.[0]?.approvedBy).toBe('p-dm');
    expect(r.hq?.attribution).toContain('CC BY 4.0');
  });

  it('the same input always makes the same bytes', () => {
    expect(sha256Hex(buildFieldBundle())).toBe(sha256Hex(buildFieldBundle()));
  });

  it('the committed fixtures are readable and clean', () => {
    for (const name of ['FIELD_sample.zip', 'HQ_sample.zip']) {
      const r = readBundle(new Uint8Array(readFileSync(new URL(`../fixtures/${name}`, import.meta.url))));
      expect(r.ok && r.problems).toEqual([]);
    }
  });

  it('a damaged photo is named, and everything else still imports', () => {
    const files = unzipSync(buildFieldBundle());
    const path = `photos/${IDS.photo1}.jpg`;
    files[path] = files[path]!.map((b, i) => (i === 20 ? b ^ 0xff : b));
    const r = readBundle(rezip(files));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.problems.map((p) => p.path)).toEqual([path]);
    expect(r.field?.encounters).toHaveLength(3);
    expect(r.field?.photoFiles?.[IDS.photo1]).toBeUndefined();
    expect(r.field?.photoFiles?.[IDS.photo2]).toBeDefined();
  });

  it('an invalid record is kept aside, not lost, and the rest import', () => {
    const files = unzipSync(buildFieldBundle());
    const list = JSON.parse(new TextDecoder().decode(files['records/encounters.json']));
    list[1].sex = 'unknown';
    const bytes = strToU8(JSON.stringify(list));
    files['records/encounters.json'] = bytes;
    const manifest = JSON.parse(new TextDecoder().decode(files['manifest.json']));
    const entry = manifest.contents.find((c: { path: string }) => c.path === 'records/encounters.json');
    entry.sha256 = sha256Hex(bytes);
    entry.bytes = bytes.length;
    files['manifest.json'] = strToU8(JSON.stringify(manifest));
    const r = readBundle(rezip(files));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.field?.encounters).toHaveLength(2);
    expect(r.rejected).toHaveLength(1);
    expect(r.problems[0]?.message).toContain('Item 2');
  });

  it('refuses things that are not bundles, or are from a different major version', () => {
    expect(readBundle(strToU8('not a zip')).ok).toBe(false);
    expect(readBundle(zipSync({ 'hello.txt': strToU8('hi') })).ok).toBe(false);
    const files = unzipSync(buildFieldBundle());
    const manifest = JSON.parse(new TextDecoder().decode(files['manifest.json']));
    manifest.contractVersion = '2.0.0';
    files['manifest.json'] = strToU8(JSON.stringify(manifest));
    const r = readBundle(rezip(files));
    expect(r.ok).toBe(false);
  });

  it('keeps files it does not recognise', () => {
    const files = unzipSync(buildFieldBundle());
    files['future/new-thing.json'] = strToU8('{}');
    const r = readBundle(rezip(files));
    expect(r.ok && Object.keys(r.unknownFiles)).toEqual(['future/new-thing.json']);
  });

  it('names files readably', () => {
    const r = readBundle(buildFieldBundle());
    if (!r.ok) throw new Error(r.error);
    expect(bundleFileName(r.manifest)).toBe('FIELD_cr-herps_team-b_d0b1_20261016-2130.zip');
  });
});
