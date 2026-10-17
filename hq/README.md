# HQ: the Data Manager's laptop app

The base-camp half of sciworks-fieldkit. It works with **no internet** once installed. It:

- **imports Field bundles** from many phones without ever duplicating or losing anything. Re-sends are harmless;
- shows every team's points on **one map** over the transect lines;
- runs a **QA queue**: approve, reject or send a correction, one keystroke per record;
- makes **HQ bundles** for each team: the form, transects, species pack, receipts, review results and approved
  corrections;
- **exports approved records to Darwin Core** (Event + Occurrence + MeasurementOrFact, with `meta.xml` and
  `eml.xml`) for GBIF.

It meets the phone app only through bundle files (see `briefs/SHARED-CONTRACT.md`), and it runs the same shared
checks as the phone (`@sciworks/shared`).

## Run it

From the repo root:

```bash
npm install
npm run dev -w @sciworks/hq
```

Open the address it prints, then click **Load demo project**. To try it without a phone, use
**More → Import sample Field bundle**, or drag any `FIELD_*.zip` onto the window.

For an installable offline build:

```bash
npm run build -w @sciworks/hq && npm run preview -w @sciworks/hq
```

Then use the browser's "Install app" button. After that it opens with no internet.

Tests (import twice = no change, damaged photo, edited-after-review, export holds back unapproved records):

```bash
npm test -w @sciworks/hq
```

## Rules it keeps

- **Never lose or duplicate data.** Every raw bundle file is kept in the browser database (`Dexie`/IndexedDB);
  **More → Export HQ backup** zips them all, with HQ's own decisions in `hq-state.json`. Records merge on
  `(recordType, id, rev)`: an older version is kept as history, never overwritten. Incomplete or invalid items are
  held aside, never dropped.
- **The phone's check results are never overwritten.** HQ re-runs `checkCoordinate`, `checkRanges` and
  `batchCheckTransect` and stores its results next to the phone's.
- **Only approved records leave HQ.** A record that changed after approval, or that has a correction waiting for
  the surveyor's answer, is held back from the export.
- **People decide.** Every approval, rejection and correction stores who and when.

## Where things are

| File | What |
|---|---|
| `src/db.ts` | The database tables |
| `src/lib/importBundle.ts` | Import and merge (SHARED-CONTRACT §7.2) |
| `src/lib/checks.ts` | HQ's re-run of the shared checks |
| `src/lib/hqBundle.ts` | HQ → phone bundle (§7.3) |
| `src/lib/dwc.ts` | Darwin Core export |
| `src/App.tsx` | The one main screen: queue, map, detail |

## Notes

- The map has **no basemap** on purpose: transect lines and points on a plain background, so it is safe offline.
- Licences: code MIT. The demo species pack is CC BY 4.0; its `attribution.md` goes into every Darwin Core export.
